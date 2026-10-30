import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generateKeyPairSync } from 'node:crypto';
import { initializeLocalInstallation } from '../packages/core/dist/index.js';
import { saveAppConnection } from '../packages/cli/dist/github-app-store.js';
import { runProjectCli } from '../packages/cli/dist/project.js';
import { runGitHubAppCli } from '../packages/cli/dist/github-app-transport.js';
const execute = promisify(execFile);
const key = generateKeyPairSync('rsa', {
  modulusLength: 2048,
}).privateKey.export({ type: 'pkcs8', format: 'pem' });
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mz-checkout-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const settings = await initializeLocalInstallation({
    configFile: join(root, 'config/config.json'),
    companyDirectory: join(root, 'company'),
    stateDirectory: join(root, 'state'),
    id: 'sample',
    name: 'Sample',
  });
  const bin = join(root, 'bin');
  await mkdir(bin);
  await writeFile(
    join(bin, 'git'),
    `#!${process.execPath}\nimport {execFileSync} from 'node:child_process'; const a=process.argv.slice(2); const i=a.indexOf('clone'); if(i>=0){const dest=a.at(-1),url=a.at(-2);execFileSync('/usr/bin/git',['init','-q',dest]);execFileSync('/usr/bin/git',['-C',dest,'remote','add','origin',url]);}else{process.stdout.write(execFileSync('/usr/bin/git',a));}`,
    { mode: 0o700 },
  );
  await writeFile(join(bin, 'gh'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const env = {
    ...process.env,
    PATH: bin + ':' + process.env.PATH,
    MZ_CONFIG_FILE: join(root, 'config/config.json'),
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
        repository_selection: 'all',
        suspended_at: null,
        permissions,
      };
    if (path.endsWith('/access_tokens'))
      return {
        token: 'ghs_synthetic',
        expires_at: new Date(Date.now() + 3500000).toISOString(),
        permissions: { metadata: 'read', ...body.permissions },
        ...(body.repository_ids
          ? { repositories: body.repository_ids.map((id) => ({ id })) }
          : {}),
      };
    if (path.endsWith('/memberships/human'))
      return { state: 'active', role: 'admin', user: { id: 10 } };
    if (path === '/repos/sample-org/game')
      return { id: 11, name: 'game', owner: { id: 9 }, private: true };
    throw Error('Unexpected fixture route');
  };
  await saveAppConnection({
    companyDirectory: settings.companyDirectory,
    env,
    request,
    connection: {
      schemaVersion: 1,
      appId: 7,
      installationId: 8,
      organizationId: 9,
      organization: 'sample-org',
      ownerId: 10,
      owner: 'human',
    },
    privateKey: Buffer.from(key),
  });
  return { root, settings, env, request, directory: join(root, 'my game') };
}
test('checkout prepares repository-local renewable credentials and ticket instructions without saving tokens', async (t) => {
  const f = await fixture(t);
  const result = await runProjectCli(['checkout', 'game', f.directory], f);
  assert.equal(result.exitCode, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.repository, 'sample-org/game');
  assert.equal(data.deliveryReady, false);
  const agents = await readFile(join(f.directory, 'AGENTS.md'), 'utf8');
  assert.match(agents, /GitHub Issues/);
  assert.match(agents, /milestone/i);
  const activation = await readFile(join(f.directory, '.mz/activate'), 'utf8');
  assert.match(activation, /MZ_GITHUB_REPOSITORY/);
  assert.match(activation, /sample-org\/game/);
  assert.doesNotMatch(activation, /ghs_|PRIVATE KEY|GH_TOKEN=/);
  const config = (
    await execute('/usr/bin/git', [
      '-C',
      f.directory,
      'config',
      '--local',
      '--get-all',
      'credential.https://github.com.helper',
    ])
  ).stdout;
  assert.match(config, /MZ_GITHUB_REPOSITORY/);
  assert.doesNotMatch(config, /ghs_|PRIVATE KEY/);
  assert.match(
    (
      await execute('/usr/bin/git', [
        '-C',
        f.directory,
        'status',
        '--porcelain',
      ])
    ).stdout,
    /AGENTS.md/,
  );
  assert.doesNotMatch(
    (
      await execute('/usr/bin/git', [
        '-C',
        f.directory,
        'status',
        '--porcelain',
      ])
    ).stdout,
    /\.mz/,
  );
  await writeFile(join(f.directory, 'AGENTS.md'), 'Existing workflow\n');
  assert.equal(
    (await runProjectCli(['checkout', 'game', f.directory], f)).exitCode,
    0,
  );
  assert.equal(
    await readFile(join(f.directory, 'AGENTS.md'), 'utf8'),
    'Existing workflow\n',
  );
});
test('checkout preserves unrelated destinations and delivery selection fails before creating a folder', async (t) => {
  const f = await fixture(t);
  await mkdir(f.directory);
  await writeFile(join(f.directory, 'owner.txt'), 'keep');
  assert.equal(
    (await runProjectCli(['checkout', 'game', f.directory], f)).exitCode,
    1,
  );
  assert.equal(await readFile(join(f.directory, 'owner.txt'), 'utf8'), 'keep');
  const next = join(f.root, 'delivery');
  const result = await runProjectCli(
    ['checkout', 'game', next, '--delivery'],
    f,
  );
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /mz github permissions/);
  await assert.rejects(readFile(join(next, 'AGENTS.md')), { code: 'ENOENT' });
});
test('activated Git ignores inherited personal authentication and URL rewrites', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await runProjectCli(['checkout', 'game', f.directory], f)).exitCode,
    0,
  );
  const config = join(f.root, 'personal.gitconfig');
  await writeFile(
    config,
    '[url "ssh://personal@github.com/"]\n  insteadOf = https://github.com/\n[http]\n  extraHeader = Authorization: synthetic-personal\n',
  );
  const active = await execute(
    '/bin/bash',
    [
      '-c',
      'source "$1"; git -C "$2" remote get-url origin',
      'bash',
      join(f.directory, '.mz/activate'),
      f.directory,
    ],
    {
      env: {
        ...f.env,
        GIT_CONFIG_GLOBAL: config,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'url.ssh://environment@github.com/.insteadOf',
        GIT_CONFIG_VALUE_0: 'https://github.com/',
      },
    },
  );
  assert.equal(active.stdout.trim(), 'https://github.com/sample-org/game.git');
});
test('existing local personal authentication is preserved and refused rather than reused', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await runProjectCli(['checkout', 'game', f.directory], f)).exitCode,
    0,
  );
  await execute('/usr/bin/git', [
    '-C',
    f.directory,
    'config',
    '--local',
    'http.extraHeader',
    'Authorization: synthetic-personal',
  ]);
  assert.equal(
    (await runProjectCli(['checkout', 'game', f.directory], f)).exitCode,
    1,
  );
  assert.equal(
    (
      await execute('/usr/bin/git', [
        '-C',
        f.directory,
        'config',
        '--local',
        'http.extraHeader',
      ])
    ).stdout.trim(),
    'Authorization: synthetic-personal',
  );
});
test('project native clients reject cross-project requests and use renewed App tokens for the selected project', async (t) => {
  const f = await fixture(t);
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests++;
    return new Response(
      JSON.stringify(
        await f.request(
          options.method,
          new URL(url).pathname,
          options.body ? JSON.parse(options.body) : undefined,
        ),
      ),
      { status: 200 },
    );
  };
  const env = {
    ...f.env,
    MZ_GITHUB_REPOSITORY: 'sample-org/game',
    MZ_GITHUB_PERMISSION_PROFILE: 'development',
  };
  const wrong = await runGitHubAppCli(
    ['credential', 'get'],
    env,
    'protocol=https\nhost=github.com\npath=sample-org/other.git\n\n',
  );
  assert.equal(wrong.stdout, 'quit=true\n\n');
  assert.equal(
    (
      await runGitHubAppCli(
        [
          'gh',
          join(f.root, 'bin/gh'),
          'issue',
          'list',
          '--repo',
          'sample-org/other',
        ],
        env,
      )
    ).exitCode,
    1,
  );
  assert.equal(requests, 0);
  for (let i = 0; i < 2; i++) {
    const result = await runGitHubAppCli(
      ['credential', 'get'],
      env,
      'protocol=https\nhost=github.com\npath=sample-org/game.git\n\n',
    );
    assert.match(result.stdout, /password=ghs_synthetic/);
  }
  assert.ok(requests > 0);
  assert.equal(
    (
      await runGitHubAppCli(
        [
          'gh',
          join(f.root, 'bin/gh'),
          'secret',
          'list',
          '--repo',
          'sample-org/game',
        ],
        env,
      )
    ).exitCode,
    0,
  );
  const upgrade = await runGitHubAppCli(['permissions'], env);
  assert.equal(upgrade.exitCode, 0);
  assert.ok(JSON.parse(upgrade.stdout).missing.includes('workflows'));
  assert.equal(
    (
      await runGitHubAppCli(['permissions'], {
        ...env,
        MZ_GITHUB_PERMISSION_PROFILE: 'wrong',
      })
    ).exitCode,
    1,
  );
});
