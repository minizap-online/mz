import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  initializeLocalInstallation,
  openRuntimeState,
} from '../packages/core/dist/index.js';
import * as conversations from '../packages/cli/dist/conversation.js';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mz-owner-chat-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configFile = join(root, 'settings/config.json');
  const settings = await initializeLocalInstallation({
    configFile,
    companyDirectory: join(root, 'company'),
    stateDirectory: join(root, 'state'),
    id: 'sample',
    name: 'Sample',
  });
  const bin = join(root, 'bin');
  await mkdir(bin);
  const capture = join(root, 'capture.json');
  await writeFile(
    join(bin, 'codex'),
    `#!${process.execPath}\nimport fs from 'node:fs';\nif(process.argv.includes('--version'))process.exit(0);\nconst args=process.argv.slice(2);const directories=fs.readdirSync(process.env.MZ_TEST_ARTIFACTS);const id=directories.at(-1);const request=JSON.parse(fs.readFileSync(process.env.MZ_TEST_ARTIFACTS+'/'+id+'/request.json','utf8'));fs.writeFileSync(process.env.MZ_TEST_CAPTURE,JSON.stringify({args,cwd:process.cwd(),request}));process.exit(Number(process.env.MZ_TEST_EXIT??0));\n`,
    { mode: 0o700 },
  );
  return {
    root,
    settings,
    env: {
      PATH: bin + ':' + process.env.PATH,
      MZ_CONFIG_FILE: configFile,
      MZ_TEST_CAPTURE: capture,
      MZ_TEST_ARTIFACTS: settings.artifactDirectory,
    },
    capture,
  };
}
test('guide print prepares bounded resumable owner setup without a model or runtime mutation', async (t) => {
  const f = await fixture(t);
  const result = await conversations.runOwnerConversation(
    'guide',
    ['--print'],
    { env: f.env, terminal: false },
  );
  assert.equal(result.exitCode, 0);
  const data = JSON.parse(result.stdout);
  assert.match(data.request.context, /one question at a time/i);
  assert.match(data.request.context, /ONBOARDING.md/);
  assert.match(data.request.context, /developer/);
  assert.equal(data.request.scope, 'company');
  assert.ok(Buffer.byteLength(result.stdout) < 131072);
  const state = openRuntimeState({
    path: f.settings.runtimePath,
    existingOnly: true,
  });
  assert.equal(state.listEvents().length, 0);
  state.close();
  await assert.rejects(readFile(f.capture));
});
test('actual launcher uses fixed scoped Codex argv and private context, recording only honest run lifecycle', async (t) => {
  const f = await fixture(t);
  const question = 'synthetic-private-owner-question';
  const result = await conversations.runOwnerConversation('ask', [question], {
    env: f.env,
    terminal: true,
  });
  assert.equal(result.exitCode, 0);
  const call = JSON.parse(await readFile(f.capture, 'utf8'));
  assert.equal(call.cwd, f.settings.companyDirectory);
  assert.ok(call.args.includes('workspace-write'));
  assert.ok(call.args.includes('on-request'));
  assert.doesNotMatch(
    JSON.stringify(call.args),
    new RegExp(question + '|dangerously|danger-full-access|--add-dir'),
  );
  assert.equal(call.request.question, question);
  assert.equal(call.request.scope, 'company');
  const state = openRuntimeState({
    path: f.settings.runtimePath,
    existingOnly: true,
  });
  assert.equal(state.listEvents().length, 2);
  assert.equal(state.getRun(state.listEvents()[0].runId).outcome, 'succeeded');
  assert.equal(state.listStewardInteractions().length, 0);
  state.close();
  assert.match(result.stdout, /curated|knowledge/i);
  assert.doesNotMatch(result.stdout, /handover saved/i);
});
test('nonzero Codex outcome is recorded failed and missing TTY/unknown options do not start a run', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await conversations.runOwnerConversation('guide', [], {
        env: f.env,
        terminal: false,
      })
    ).exitCode,
    2,
  );
  assert.equal(
    (
      await conversations.runOwnerConversation('guide', ['--unknown'], {
        env: f.env,
        terminal: true,
      })
    ).exitCode,
    2,
  );
  assert.equal(
    (
      await conversations.runOwnerConversation('ask', ['hello'], {
        env: { ...f.env, MZ_TEST_EXIT: '7' },
        terminal: true,
      })
    ).exitCode,
    7,
  );
  const state = openRuntimeState({
    path: f.settings.runtimePath,
    existingOnly: true,
  });
  const events = state.listEvents();
  assert.equal(events.length, 2);
  assert.equal(state.getRun(events[0].runId).outcome, 'failed');
  state.close();
});
