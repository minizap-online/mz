import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  lstat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import {
  bindAppGit,
  runGitHubAppCli,
} from '../packages/cli/dist/github-app-transport.js';
import {
  startAppSetup,
  connectGitHubApp,
} from '../packages/cli/dist/github-app-setup.js';
import { saveAppConnection } from '../packages/cli/dist/github-app-store.js';
const execute = promisify(execFile);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mz-app-review-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const company = join(root, 'company');
  await mkdir(company, { mode: 0o700 });
  return {
    root,
    company,
    env: {
      ...process.env,
      MZ_CONFIG_FILE: join(root, 'config/config.json'),
      MZ_GITHUB_APP_COMPANY: company,
      GH_REPO: 'sample-org/website',
    },
  };
}
test('failed App Git helper terminates real Git before inherited askpass or interactive fallback', async (t) => {
  const f = await fixture(t);
  await execute('git', ['init', '-q', f.company]);
  await bindAppGit(f.company, f.env);
  const asked = join(f.root, 'asked');
  const askpass = join(f.root, 'askpass');
  await writeFile(
    askpass,
    '#!/bin/sh\ntouch ' + JSON.stringify(asked) + '\necho synthetic-personal\n',
    { mode: 0o700 },
  );
  const output = await new Promise((resolve) => {
    const child = execFile(
      'git',
      ['-C', f.company, 'credential', 'fill'],
      {
        env: {
          ...f.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: askpass,
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null',
        },
      },
      (error, stdout) => resolve({ failed: !!error, stdout }),
    );
    child.stdin.end(
      'protocol=https\nhost=github.com\npath=sample-org/website.git\n\n',
    );
  });
  assert.equal(output.failed, true);
  assert.doesNotMatch(output.stdout, /synthetic-personal/);
  await assert.rejects(() => lstat(asked));
});
test('registration intent survives a lost conversion response and rerun requires recovery instead of a new registration', async (t) => {
  const f = await fixture(t);
  const options = {
    companyDirectory: f.company,
    env: f.env,
    organization: 'sample-org',
    owner: 'human',
    request: async () => {
      throw Error('response lost after remote registration');
    },
  };
  const flow = await startAppSetup(options);
  t.after(() => flow.close());
  const url = new URL(flow.url);
  assert.equal((await fetch(flow.url)).status, 200);
  assert.equal(
    (await fetch(url.origin + '/manifest' + url.search + '&code=synthetic'))
      .status,
    400,
  );
  flow.close();
  const questions = [];
  await assert.rejects(() =>
    connectGitHubApp({
      ...options,
      notice: (text) => {
        if (text.startsWith('MZ GitHub App:'))
          throw Error('must recover before new registration');
      },
      question: async (label) => {
        questions.push(label);
        return 'no';
      },
    }),
  );
  assert.ok(
    !questions.some((q) => q === 'GitHub organization for this MZ connection'),
  );
  assert.equal(
    JSON.parse(
      await readFile(
        join(f.root, 'config/github-app/registration.json'),
        'utf8',
      ),
    ).organization,
    'sample-org',
  );
});
test('native gh rejects URL/host overrides before token issuance and disables shared keyring only in the child', async (t) => {
  const f = await fixture(t);
  const privateKey = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  const connection = {
    schemaVersion: 1,
    appId: 7,
    installationId: 8,
    organizationId: 9,
    organization: 'sample-org',
    ownerId: 10,
    owner: 'human',
  };
  const permissions = {
    metadata: 'read',
    contents: 'write',
    issues: 'write',
    pull_requests: 'write',
    repository_creation: 'write',
    organization_projects: 'write',
    members: 'read',
  };
  const request = async (method, path, body) => {
    if (path === '/app')
      return { id: 7, owner: { id: 9, type: 'Organization' }, permissions };
    if (path === '/app/installations/8')
      return {
        id: 8,
        app_id: 7,
        account: { id: 9, type: 'Organization', login: 'sample-org' },
        suspended_at: null,
        repository_selection: 'all',
        permissions,
      };
    if (path.endsWith('/access_tokens'))
      return {
        token: 'ghs_synthetic_review',
        expires_at: new Date(Date.now() + 3500000).toISOString(),
        permissions: { metadata: 'read', ...body.permissions },
        ...(body.repository_ids
          ? { repositories: body.repository_ids.map((id) => ({ id })) }
          : {}),
      };
    if (path.endsWith('/memberships/human'))
      return { state: 'active', role: 'admin', user: { id: 10 } };
    if (path === '/repos/sample-org/website')
      return { id: 11, name: 'website', private: true, owner: { id: 9 } };
    throw Error('no real network');
  };
  await saveAppConnection({
    ...f,
    companyDirectory: f.company,
    connection,
    privateKey: Buffer.from(privateKey),
    request,
  });
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    return new Response(
      JSON.stringify(
        await request(
          options.method,
          new URL(url).pathname,
          options.body ? JSON.parse(options.body) : undefined,
        ),
      ),
      { status: 200 },
    );
  };
  const native = join(f.root, 'gh');
  const capture = join(f.root, 'capture.json');
  await writeFile(
    native,
    `#!${process.execPath}\nimport fs from'node:fs';fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({bus:process.env.DBUS_SESSION_BUS_ADDRESS,token:process.env.GH_TOKEN}));`,
    { mode: 0o700 },
  );
  for (const args of [
    ['api', 'http://api.github.com/user'],
    ['api', 'user', '--hostname', 'other.example'],
    ['api', '//other.example/user'],
  ]) {
    const result = await runGitHubAppCli(['gh', native, ...args], f.env);
    assert.equal(result.exitCode, 1);
    assert.equal(calls, 0);
  }
  const env = {
    ...f.env,
    DBUS_SESSION_BUS_ADDRESS: 'synthetic-owner-codex-bus',
  };
  const result = await runGitHubAppCli(
    ['gh', native, 'api', 'repos/sample-org/website'],
    env,
  );
  assert.equal(result.exitCode, 0);
  const child = JSON.parse(await readFile(capture, 'utf8'));
  assert.equal(child.bus, 'unix:path=/dev/null/mz-private-gh-no-keyring');
  assert.equal(child.token, 'ghs_synthetic_review');
  assert.equal(env.DBUS_SESSION_BUS_ADDRESS, 'synthetic-owner-codex-bus');
});
