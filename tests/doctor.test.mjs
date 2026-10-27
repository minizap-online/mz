import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';
import * as adapter from '../packages/state/dist/index.js';
const actorId = '11111111-1111-4111-8111-111111111111';
const destinationId = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const now = '2026-10-27T12:00:00.000Z';
const healthyHost = {
  nodeVersion: 'v24.0.0',
  async probeCommand() {
    return { ok: true, stdout: '11.0.0\nsynthetic-doctor-secret' };
  },
};
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mz-doctor-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, 'company.yaml'),
    'schemaVersion: 1\nid: example\nname: Example\n',
  );
  const runtimePath = join(root, 'runtime.sqlite3');
  const state = core.openRuntimeState({ path: runtimePath });
  t.after(() => state.close());
  return {
    root,
    state,
    options: { company: { directory: root, env: {} }, runtimePath, now },
  };
}
function checks(report) {
  return Object.fromEntries(report.checks.map((c) => [c.id, c]));
}
function safe(report) {
  assert.doesNotMatch(
    JSON.stringify(report),
    /synthetic-doctor-secret|mz-doctor-|namespace:credential/,
  );
}

test('doctor reports unavailable configuration and offline provider honestly', async (t) => {
  const f = await fixture(t);
  const report = await core.runDoctor(f.options, healthyHost);
  const c = checks(report);
  assert.equal(report.healthy, false);
  assert.equal(c.company.status, 'pass');
  assert.equal(c['config.secrets'].status, 'pass');
  assert.equal(c.runtime.status, 'pass');
  assert.equal(c['backup.freshness'].status, 'fail');
  assert.equal(c['secrets.access'].status, 'unavailable');
  assert.equal(c['github.auth'].status, 'unavailable');
  assert.equal(c['github.integration'].status, 'unavailable');
  assert.equal(c['devbox.tools'].status, 'pass');
  safe(report);
});
for (const [start, status] of [
  ['2026-10-27T10:00:00.000Z', 'pass'],
  ['2026-10-25T10:00:00.000Z', 'fail'],
  ['2026-10-28T10:00:00.000Z', 'fail'],
]) {
  test(`doctor reports backup age for ${start}`, async (t) => {
    const f = await fixture(t);
    adapter.beginRuntimeBackup(f.state, {
      id,
      actorId,
      destinationId,
      startedAt: start,
    });
    adapter.finishRuntimeBackup(f.state, {
      id,
      outcome: 'succeeded',
      finishedAt: start,
    });
    const report = await core.runDoctor(f.options, healthyHost);
    const c = checks(report);
    assert.equal(c['backup.freshness'].status, status);
    assert.equal(
      c['backup.freshness'].ageMs,
      Date.parse(now) < Date.parse(start)
        ? null
        : Date.parse(now) - Date.parse(start),
    );
    assert.equal(c['backup.latest-attempt'].status, 'pass');
    safe(report);
  });
}
test('latest failed/pending backups remain unhealthy independently of fresh success', async (t) => {
  const f = await fixture(t);
  adapter.beginRuntimeBackup(f.state, {
    id,
    actorId,
    destinationId,
    startedAt: now,
  });
  adapter.finishRuntimeBackup(f.state, {
    id,
    outcome: 'succeeded',
    finishedAt: now,
  });
  adapter.beginRuntimeBackup(f.state, {
    id: actorId,
    actorId,
    destinationId,
    startedAt: now,
  });
  let c = checks(await core.runDoctor(f.options, healthyHost));
  assert.equal(c['backup.freshness'].status, 'pass');
  assert.equal(c['backup.latest-attempt'].status, 'fail');
  adapter.finishRuntimeBackup(f.state, {
    id: actorId,
    outcome: 'failed',
    finishedAt: now,
  });
  c = checks(await core.runDoctor(f.options, healthyHost));
  assert.equal(c['backup.freshness'].status, 'pass');
  assert.equal(c['backup.latest-attempt'].status, 'fail');
});
test('unavailable runtime blocks backup checks and does not create a database', async (t) => {
  const f = await fixture(t);
  const report = await core.runDoctor(
    { ...f.options, runtimePath: join(f.root, 'missing.sqlite3') },
    healthyHost,
  );
  const c = checks(report);
  assert.equal(c.runtime.status, 'fail');
  assert.equal(c['backup.freshness'].status, 'unavailable');
  safe(report);
});
for (const value of [
  'Bearer synthetic-doctor-secret',
  'password=synthetic-doctor-secret',
  'ghp_' + 'x'.repeat(36),
  '-----BEGIN PRIVATE KEY-----',
]) {
  test(
    'obvious credential-like company names fail without echoing contents: ' +
      value.slice(0, 6),
    async (t) => {
      const f = await fixture(t);
      await writeFile(
        join(f.root, 'company.yaml'),
        `schemaVersion: 1\nid: example\nname: ${JSON.stringify(value)}\n`,
      );
      const report = await core.runDoctor(f.options, healthyHost);
      assert.equal(checks(report)['config.secrets'].status, 'fail');
      safe(report);
      assert.ok(!JSON.stringify(report).includes(value));
    },
  );
}
test('secret access resolves real private files without rendering values or references', async (t) => {
  const f = await fixture(t);
  const directory = join(f.root, 'secrets');
  await mkdir(directory, { mode: 0o700 });
  const path = join(directory, 'key');
  await writeFile(path, 'synthetic-doctor-secret', { mode: 0o600 });
  const options = {
    ...f.options,
    secrets: { directory, bindings: { 'namespace:credential': 'key' } },
  };
  let report = await core.runDoctor(options, healthyHost);
  assert.equal(checks(report)['secrets.access'].status, 'pass');
  safe(report);
  await chmod(path, 0o644);
  report = await core.runDoctor(options, healthyHost);
  assert.equal(checks(report)['secrets.access'].status, 'fail');
  safe(report);
});
test('GitHub auth is opt-in and uses fixed read-only argv while failed command output stays private', async (t) => {
  const f = await fixture(t);
  const calls = [];
  const host = {
    nodeVersion: 'v24.0.0',
    async probeCommand(command, args) {
      calls.push([command, args]);
      return {
        ok: !args.includes('api'),
        stdout: '11.0.0\nsynthetic-doctor-secret',
      };
    },
  };
  let report = await core.runDoctor(f.options, host);
  assert.equal(checks(report)['github.auth'].status, 'unavailable');
  safe(report);
  assert.ok(!calls.some(([, args]) => args.includes('api')));
  report = await core.runDoctor({ ...f.options, githubAuth: true }, host);
  assert.equal(checks(report)['github.auth'].status, 'fail');
  assert.deepEqual(calls.at(-1), ['gh', ['api', 'user', '--silent']]);
  safe(report);
  report = await core.runDoctor(
    { ...f.options, githubAuth: true },
    healthyHost,
  );
  assert.equal(checks(report)['github.auth'].status, 'pass');
  assert.equal(checks(report)['github.integration'].status, 'unavailable');
});
test('missing tools, unsupported Node/npm, and thrown probe failures are actionable and safe', async (t) => {
  const f = await fixture(t);
  const report = await core.runDoctor(f.options, {
    nodeVersion: 'v22.0.0',
    async probeCommand(command) {
      if (command === 'npm') return { ok: true, stdout: '10.1.0' };
      throw new Error('synthetic-doctor-secret');
    },
  });
  const c = checks(report);
  for (const name of ['node', 'npm', 'git', 'gh', 'codex', 'tmux']) {
    assert.notEqual(c['tool.' + name].status, 'pass');
    assert.ok(c['tool.' + name].action.length > 0);
  }
  assert.equal(c['devbox.tools'].status, 'fail');
  safe(report);
});
test('invalid diagnostic options fail with a static error without evaluating accessors', async () => {
  let reads = 0;
  for (const options of [
    { runtimePath: 'relative' },
    { secrets: {} },
    { secrets: { directory: '/private', bindings: {} } },
    { secrets: { directory: 'relative', bindings: { 'host:example': 'key' } } },
    {
      secrets: {
        directory: '/private',
        bindings: { 'host:example': '../key' },
      },
    },
    {
      secrets: {
        directory: '/private',
        bindings: {
          get 'host:example'() {
            reads++;
            throw new Error('synthetic-doctor-secret');
          },
        },
      },
    },
    { backupMaxAgeMs: 0 },
    { githubAuth: 'yes' },
    { token: 'synthetic-doctor-secret' },
    {
      get runtimePath() {
        reads++;
        throw new Error('synthetic-doctor-secret');
      },
    },
  ]) {
    await assert.rejects(core.runDoctor(options, healthyHost), (e) => {
      assert.equal(e.code, 'INVALID_DOCTOR_OPTIONS');
      assert.doesNotMatch(
        JSON.stringify(e) + e.stack,
        /synthetic-doctor-secret/,
      );
      return true;
    });
  }
  assert.equal(reads, 0);
});
