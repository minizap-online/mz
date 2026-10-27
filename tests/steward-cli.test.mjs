import assert from 'node:assert/strict';
import { execFile as execute } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { openRuntimeState } from '../packages/core/dist/index.js';
import { runCli } from '../packages/cli/dist/index.js';
import { contextFixture } from './helpers/context-fixture.mjs';
const exec = promisify(execute),
  cli = resolve('packages/cli/bin/mz.js');
test('status/ask discovery and invalid invocations require no setup or input', async () => {
  for (const command of ['status', 'ask']) {
    const result = await runCli([command, '--help'], 'test');
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, new RegExp('mz ' + command));
    const invalid = await runCli(
      [command, '--unknown', 'synthetic-private-argument'],
      'test',
    );
    assert.equal(invalid.exitCode, 2);
    assert.doesNotMatch(invalid.stderr, /synthetic-private-argument/);
  }
});
test('installed status reports private selected evidence and missing runtime without initialization', async (t) => {
  const f = await contextFixture(t);
  const path = join(f.root, 'missing.sqlite3');
  const { stdout } = await exec(process.execPath, [
    cli,
    'status',
    '--company',
    f.root,
    '--project',
    'alpha',
    '--runtime',
    path,
    '--json',
  ]);
  const result = JSON.parse(stdout);
  assert.equal(result.scope, 'project:alpha');
  assert.equal(result.runtime.availability, 'unavailable');
  assert.equal(result.provider.availability, 'unavailable');
  await assert.rejects(readFile(path));
  assert.doesNotMatch(stdout, /UNRELATED_PROJECT|beta/);
});
test('installed ask uses configured real adapter with synthetic transport and durable handover', async (t) => {
  const f = await contextFixture(t);
  const root = await mkdtemp(join(tmpdir(), 'mz-steward-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['artifacts', 'secrets'])
    await mkdir(join(root, dir), { mode: 0o700 });
  const runtime = join(root, 'state.sqlite3');
  openRuntimeState({ path: runtime }).close();
  await writeFile(join(root, 'question.md'), 'What remains before the pilot?');
  await writeFile(
    join(root, 'secrets/openai-steward'),
    'synthetic-openai-key',
    { mode: 0o600 },
  );
  const response = {
    answer: 'Choose an idea.',
    summary: 'Pilot idea is missing.',
    decisions: [],
    triage: ['Classify supplied intake.'],
    work: ['Draft criteria.'],
    knowledgeUpdates: [],
    handover: {
      completed: ['Reviewed evidence.'],
      changed: [],
      decisions: [],
      followups: ['Owner supplies idea.'],
      risks: ['No live provider.'],
      references: [],
    },
  };
  const preload = join(root, 'transport.mjs');
  await writeFile(
    preload,
    `globalThis.fetch=async (url,options)=>{if(url!=='https://api.openai.com/v1/responses')throw Error('unexpected endpoint');return new Response(JSON.stringify(${JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(response) }] }] })}));};`,
  );
  const env = {
    ...process.env,
    NODE_OPTIONS: '--import=' + preload,
    MZ_STEWARD_MODEL: 'fixture-model',
    MZ_STEWARD_MAX_OUTPUT_TOKENS: '2048',
    MZ_STEWARD_SECRET_DIR: join(root, 'secrets'),
  };
  const args = [
    cli,
    'ask',
    join(root, 'question.md'),
    '--company',
    f.root,
    '--project',
    'alpha',
    '--role',
    'developer',
    '--task',
    'job',
    '--runtime',
    runtime,
    '--artifact-directory',
    join(root, 'artifacts'),
    '--actor',
    '11111111-1111-4111-8111-111111111111',
    '--worker',
    '22222222-2222-4222-8222-222222222222',
    '--json',
  ];
  const { stdout } = await exec(process.execPath, args, { env });
  const result = JSON.parse(stdout);
  assert.equal(result.interaction.outcome, 'succeeded');
  assert.equal(result.advisory, true);
  assert.deepEqual(result.response, response);
  const state = openRuntimeState({ path: runtime, existingOnly: true });
  assert.equal(state.listEvents({ limit: 100 }).length, 2);
  state.close();
  assert.doesNotMatch(stdout, /synthetic-openai-key|mz-steward-cli-/);
});
