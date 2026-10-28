import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectGitHubApp } from '../packages/cli/dist/github-app-setup.js';
test('real App setup notice prints a copyable SSH forwarding command on the browser computer', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mz-app-forward-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let message = '';
  await assert.rejects(() =>
    connectGitHubApp({
      companyDirectory: join(root, 'company'),
      env: {
        MZ_CONFIG_FILE: join(root, 'config/config.json'),
        MZ_SSH_DESTINATION: 'owner@my-devbox',
      },
      question: async (label) =>
        label.includes('organization for') ? 'sample-org' : 'human',
      notice: (text) => {
        if (text.includes('Open this private setup page:')) {
          message = text;
          throw Error('synthetic stop after notice');
        }
      },
    }),
  );
  assert.match(message, /ssh -N .*ExitOnForwardFailure=yes/);
  const match = message.match(/http:\/\/127\.0\.0\.1:(\d+)\/start/);
  assert.ok(match);
  assert.match(
    message,
    new RegExp('-L 127.0.0.1:' + match[1] + ':127.0.0.1:' + match[1]),
  );
  assert.match(message, /'owner@my-devbox'/);
  assert.match(message, /your computer|browser.*computer/);
  assert.match(message, /separate terminal/);
});
test('served registration manifest disables webhooks with a public placeholder and requests no events', async (t) => {
  const { startAppSetup } =
    await import('../packages/cli/dist/github-app-setup.js');
  const root = await mkdtemp(join(tmpdir(), 'mz-app-no-webhook-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const flow = await startAppSetup({
    companyDirectory: join(root, 'company'),
    env: { MZ_CONFIG_FILE: join(root, 'config/config.json') },
    organization: 'sample-org',
    owner: 'human',
  });
  t.after(() => flow.close());
  const html = await (await fetch(flow.url)).text();
  const encoded = html.match(/name="manifest" value="([^"]+)"/)[1];
  const manifest = JSON.parse(
    encoded
      .replaceAll('&quot;', '"')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&'),
  );
  assert.deepEqual(manifest.hook_attributes, {
    active: false,
    url: 'https://github.com/minizap-online/mz',
  });
  assert.deepEqual(manifest.default_events, []);
  assert.equal(manifest.public, false);
  assert.equal(manifest.request_oauth_on_install, false);
  assert.equal(manifest.default_permissions.members, 'read');
  assert.equal(manifest.default_permissions.administration, undefined);
});
test('confirmed GitHub manifest rejection retries saved selection without clearing credential files', async (t) => {
  const { mkdir, writeFile, readFile } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'mz-app-rejected-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'config/github-app');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(
    join(directory, 'registration.json'),
    JSON.stringify({
      schemaVersion: 1,
      organization: 'sample-org',
      owner: 'human',
    }),
    { mode: 0o600 },
  );
  await writeFile(
    join(directory, 'retained.pem'),
    'synthetic key file retained',
    { mode: 0o600 },
  );
  let question = '',
    instructions = '';
  await assert.rejects(() =>
    connectGitHubApp({
      companyDirectory: join(root, 'company'),
      env: { MZ_CONFIG_FILE: join(root, 'config/config.json') },
      question: async (label) => {
        question = label;
        return 'yes';
      },
      notice: (text) => {
        if (text.includes('Open this private setup page:')) {
          instructions = text;
          throw Error('synthetic stop after retry notice');
        }
      },
    }),
  );
  assert.match(question, /reject.*before.*creat/i);
  assert.match(instructions, /Open this private setup page/);
  assert.equal(
    await readFile(join(directory, 'retained.pem'), 'utf8'),
    'synthetic key file retained',
  );
});
test('forwarding guidance uses separate browser/devbox ports and an explicit replacement destination', async () => {
  const { appSetupAccessInstructions } =
    await import('../packages/cli/dist/github-app-access.js');
  const text = appSetupAccessInstructions(
    { url: 'http://localhost:8765/start?state=synthetic', localPort: 45043 },
    {},
  );
  assert.match(
    text,
    /-L 127.0.0.1:8765:127.0.0.1:45043 YOUR_DEVBOX_SSH_DESTINATION/,
  );
  assert.match(text, /without a shell prompt/);
  assert.match(text, /network IP is not the browser address/);
  const unsafe = appSetupAccessInstructions(
    { url: 'http://127.0.0.1:8765/start', localPort: 45043 },
    { MZ_SSH_DESTINATION: '-oProxyCommand=bad;echo unsafe' },
  );
  assert.match(unsafe, /YOUR_DEVBOX_SSH_DESTINATION/);
  assert.doesNotMatch(unsafe, /ProxyCommand|unsafe/);
  const forwarded = appSetupAccessInstructions(
    { url: 'https://setup.example/start', localPort: 45043 },
    {},
  );
  assert.doesNotMatch(forwarded, /ssh -N/);
});
test('declining rejected-form confirmation retains registration intent without a new server or prompt for a different organization', async (t) => {
  const { mkdir, writeFile, readFile } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'mz-app-retry-no-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'config/github-app');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'registration.json');
  const original = JSON.stringify({
    schemaVersion: 1,
    organization: 'sample-org',
    owner: 'human',
  });
  await writeFile(path, original, { mode: 0o600 });
  const questions = [];
  await assert.rejects(() =>
    connectGitHubApp({
      companyDirectory: join(root, 'company'),
      env: { MZ_CONFIG_FILE: join(root, 'config/config.json') },
      question: async (label, fallback) => {
        questions.push(label);
        return fallback;
      },
      notice: () => {},
    }),
  );
  assert.equal(questions.length, 1);
  assert.match(questions[0], /reject.*before.*creat/i);
  assert.equal(await readFile(path, 'utf8'), original);
});
