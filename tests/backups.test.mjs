import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';
import * as adapter from '../packages/state/dist/index.js';
import {
  applyMigrations,
  migrations,
} from '../packages/state/dist/migrations.js';

const actorId = '11111111-1111-4111-8111-111111111111';
const workerId = '22222222-2222-4222-8222-222222222222';
const sourceId = '33333333-3333-4333-8333-333333333333';
const destinationId = '44444444-4444-4444-8444-444444444444';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mz-backup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await chmod(root, 0o700);
  const path = join(root, 'state.sqlite3');
  const state = core.openRuntimeState({ path });
  t.after(() => state.close());
  return { root, path, state };
}
function failure(code) {
  return (error) => {
    assert.ok(error instanceof core.BackupError);
    assert.equal(error.code, code);
    assert.doesNotMatch(
      JSON.stringify(error) + error.stack,
      /synthetic-backup-secret/,
    );
    assert.equal(error.cause, undefined);
    return true;
  };
}
function request(fixture, hook) {
  return {
    state: fixture.state,
    stagingDirectory: fixture.root,
    destinationId,
    actorId,
    hook,
  };
}

// This fixture transport uses real authenticated crypto; it is not a production archive format.
function encryptedFixtureHook(root) {
  const key = Buffer.alloc(32, 23);
  return {
    async store(snapshot) {
      const plain = await readFile(snapshot.snapshotPath);
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
      await writeFile(
        join(root, snapshot.backupId + '.fixture-encrypted'),
        Buffer.concat([nonce, cipher.getAuthTag(), encrypted]),
        { mode: 0o600 },
      );
      return { backupId: snapshot.backupId, encrypted: true };
    },
    async restore(id, path, tamper = false) {
      const data = await readFile(join(root, id + '.fixture-encrypted'));
      if (tamper) data[data.length - 1] ^= 1;
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        data.subarray(0, 12),
      );
      decipher.setAuthTag(data.subarray(12, 28));
      const plain = Buffer.concat([
        decipher.update(data.subarray(28)),
        decipher.final(),
      ]);
      await writeFile(path, plain, { mode: 0o600 });
    },
  };
}

test('encrypted fixture backup restores standalone run/inbox/event data through Core', async (t) => {
  const f = await fixture(t);
  const run = f.state.startRun({ actorId, workerId });
  const item = f.state.createInboxItem({ actorId, sourceId });
  const before = f.state.listEvents();
  const hook = encryptedFixtureHook(f.root);
  const result = await core.backupRuntimeState(request(f, hook));
  assert.equal(result.outcome, 'succeeded');
  assert.equal(result.encryptionAcknowledged, true);
  assert.equal(f.state.getBackup(result.id).id, result.id);
  assert.equal(f.state.listEvents().at(-1).backupId, result.id);
  assert.equal(f.state.listEvents().at(-1).type, 'backup.completed');
  assert.equal(
    (await readFile(join(f.root, result.id + '.fixture-encrypted'))).includes(
      Buffer.from('SQLite format 3'),
    ),
    false,
  );
  assert.equal(
    (await readdir(f.root)).some((name) => name.startsWith('mz-backup-')),
    false,
  );
  f.state.close();
  await rm(f.path);
  const restoredPath = join(f.root, 'restored.sqlite3');
  await hook.restore(result.id, restoredPath);
  const restored = core.openRuntimeState({ path: restoredPath });
  t.after(() => restored.close());
  assert.deepEqual(restored.verifyIntegrity(), { ok: true });
  assert.deepEqual(restored.getRun(run.id), run);
  assert.deepEqual(restored.getInboxItem(item.id), item);
  assert.deepEqual(restored.listEvents(), before);
  assert.equal(restored.getBackup(result.id).outcome, null);
});

test('authenticated fixture restoration rejects corrupted ciphertext before creating restored data', async (t) => {
  const f = await fixture(t);
  const hook = encryptedFixtureHook(f.root);
  const result = await core.backupRuntimeState(request(f, hook));
  await assert.rejects(
    hook.restore(result.id, join(f.root, 'bad.sqlite3'), true),
  );
  assert.equal((await readdir(f.root)).includes('bad.sqlite3'), false);
});

test('backup freshness reports never, fresh, stale and clock skew from durable successes', async (t) => {
  const f = await fixture(t);
  assert.equal(f.state.getBackupFreshness().status, 'never');
  const result = await core.backupRuntimeState(
    request(f, encryptedFixtureHook(f.root)),
  );
  const completed = Date.parse(result.startedAt);
  const fresh = f.state.getBackupFreshness({
    now: new Date(completed + 1000).toISOString(),
    maxAgeMs: 2000,
  });
  assert.equal(fresh.status, 'fresh');
  assert.equal(fresh.ageMs, 1000);
  assert.equal(fresh.lastSuccessAt, result.finishedAt);
  assert.equal(fresh.lastSnapshotStartedAt, result.startedAt);
  assert.equal(
    f.state.getBackupFreshness({
      now: new Date(completed + 2001).toISOString(),
      maxAgeMs: 2000,
    }).status,
    'stale',
  );
  assert.equal(
    f.state.getBackupFreshness({ now: new Date(completed - 1).toISOString() })
      .status,
    'clock-skew',
  );
});

for (const [name, receipt] of [
  ['not encrypted', (id) => ({ backupId: id, encrypted: false })],
  ['wrong identity', () => ({ backupId: actorId, encrypted: true })],
  [
    'unexpected credential field',
    (id) => ({
      backupId: id,
      encrypted: true,
      token: 'synthetic-backup-secret',
    }),
  ],
]) {
  test(`a ${name} receipt records failure and cannot advance freshness`, async (t) => {
    const f = await fixture(t);
    const hook = {
      async store(snapshot) {
        return receipt(snapshot.backupId);
      },
    };
    await assert.rejects(
      core.backupRuntimeState(request(f, hook)),
      failure('INVALID_BACKUP_RECEIPT'),
    );
    const health = f.state.getBackupFreshness();
    assert.equal(health.status, 'never');
    assert.equal(health.latestAttempt.outcome, 'failed');
    assert.equal(f.state.listEvents().at(-1).type, 'backup.failed');
    assert.equal(
      (await readdir(f.root)).some((name) => name.startsWith('mz-backup-')),
      false,
    );
  });
}

test('throwing encrypted hook sanitizes source values, cleans plaintext and audits failure', async (t) => {
  const f = await fixture(t);
  const hook = {
    async store() {
      throw new Error('synthetic-backup-secret');
    },
  };
  await assert.rejects(
    core.backupRuntimeState(request(f, hook)),
    failure('BACKUP_FAILED'),
  );
  assert.equal(f.state.getBackupFreshness().latestAttempt.outcome, 'failed');
  assert.deepEqual(
    f.state.listEvents().map((x) => x.type),
    ['backup.failed'],
  );
  assert.equal(
    (await readdir(f.root)).some((name) => name.startsWith('mz-backup-')),
    false,
  );
});

test('closing state during the hook cannot falsely claim an audited success', async (t) => {
  const f = await fixture(t);
  let id;
  const hook = {
    async store(snapshot) {
      id = snapshot.backupId;
      f.state.close();
      return { backupId: id, encrypted: true };
    },
  };
  await assert.rejects(
    core.backupRuntimeState(request(f, hook)),
    failure('BACKUP_AUDIT_FAILED'),
  );
  const reopened = core.openRuntimeState({ path: f.path });
  t.after(() => reopened.close());
  assert.equal(reopened.getBackup(id).outcome, null);
  assert.equal(reopened.getBackupFreshness().status, 'never');
  assert.deepEqual(reopened.listEvents(), []);
});

test('a later failure remains visible while an older valid success can still be fresh', async (t) => {
  const f = await fixture(t);
  const good = await core.backupRuntimeState(
    request(f, encryptedFixtureHook(f.root)),
  );
  await assert.rejects(
    core.backupRuntimeState(
      request(f, {
        async store() {
          throw new Error('unavailable');
        },
      }),
    ),
    failure('BACKUP_FAILED'),
  );
  const health = f.state.getBackupFreshness();
  assert.equal(health.status, 'fresh');
  assert.equal(health.lastSuccessAt, good.finishedAt);
  assert.equal(health.latestAttempt.outcome, 'failed');
});

test('unsafe staging directories fail before transport and leave an audited failure', async (t) => {
  const f = await fixture(t);
  let called = false;
  await chmod(f.root, 0o755);
  await assert.rejects(
    core.backupRuntimeState(
      request(f, {
        async store() {
          called = true;
        },
      }),
    ),
    failure('UNSAFE_BACKUP_STAGING'),
  );
  assert.equal(called, false);
  assert.equal(f.state.getBackupFreshness().latestAttempt.outcome, 'failed');
});

test('native snapshots cannot overwrite files and protect their connection during async backup', async (t) => {
  const f = await fixture(t);
  const output = join(f.root, 'snapshot.sqlite3');
  const pending = adapter.snapshotRuntimeState(f.state, output);
  assert.throws(
    () => f.state.close(),
    (error) => error.code === 'STATE_BUSY',
  );
  assert.throws(
    () => f.state.startRun({ actorId, workerId }),
    (error) => error.code === 'STATE_BUSY',
  );
  await pending;
  assert.deepEqual(f.state.verifyIntegrity(), { ok: true });
  await assert.rejects(adapter.snapshotRuntimeState(f.state, output));
  await assert.rejects(adapter.snapshotRuntimeState(f.state, f.path));
  const copy = core.openRuntimeState({ path: output });
  t.after(() => copy.close());
  assert.deepEqual(copy.verifyIntegrity(), { ok: true });
});

test('version-1 runtime databases upgrade with all prior records/history intact', async (t) => {
  const f = await fixture(t);
  f.state.close();
  await rm(f.path);
  const db = new DatabaseSync(f.path);
  applyMigrations(db, migrations.slice(0, 1));
  db.prepare('INSERT INTO inbox_items VALUES (?, ?, ?)').run(
    sourceId,
    actorId,
    '2026-10-27T12:00:00.000Z',
  );
  db.prepare('INSERT INTO runs VALUES (?, ?, ?, ?, ?)').run(
    workerId,
    actorId,
    '2026-10-27T11:00:00.000Z',
    '2026-10-27T12:00:00.000Z',
    'succeeded',
  );
  db.prepare(
    'INSERT INTO events (id, type, actor_id, occurred_at, run_id, inbox_item_id) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    destinationId,
    'decision.recorded',
    actorId,
    '2026-10-27T12:00:00.000Z',
    workerId,
    sourceId,
  );
  db.close();
  const upgraded = core.openRuntimeState({ path: f.path });
  t.after(() => upgraded.close());
  assert.equal(upgraded.getStatus().schemaVersion, 3);
  assert.equal(upgraded.getInboxItem(sourceId).sourceId, actorId);
  assert.deepEqual(upgraded.getRun(workerId), {
    id: workerId,
    workerId: actorId,
    startedAt: '2026-10-27T11:00:00.000Z',
    finishedAt: '2026-10-27T12:00:00.000Z',
    outcome: 'succeeded',
  });
  assert.deepEqual(upgraded.listEvents(), [
    {
      sequence: 1,
      id: destinationId,
      type: 'decision.recorded',
      actorId,
      occurredAt: '2026-10-27T12:00:00.000Z',
      runId: workerId,
      inboxItemId: sourceId,
      backupId: null,
    },
  ]);
  assert.equal(upgraded.getBackupFreshness().status, 'never');
  assert.deepEqual(upgraded.verifyIntegrity(), { ok: true });
});

for (const policy of [
  { maxAgeMs: 0 },
  { maxAgeMs: -1 },
  { now: 'bad' },
  { token: 'synthetic-backup-secret' },
]) {
  test(`invalid freshness policy is rejected: ${JSON.stringify(policy)}`, async (t) => {
    const f = await fixture(t);
    assert.throws(
      () => f.state.getBackupFreshness(policy),
      (error) => error.code === 'INVALID_INPUT',
    );
  });
}

test('inconsistent snapshot references fail before transport and record backup failure', async (t) => {
  const f = await fixture(t);
  const raw = new DatabaseSync(f.path);
  raw.exec('PRAGMA foreign_keys=OFF');
  raw
    .prepare(
      'INSERT INTO events (id, type, actor_id, occurred_at, run_id) VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      workerId,
      'decision.recorded',
      actorId,
      '2026-10-27T12:00:00.000Z',
      sourceId,
    );
  raw.close();
  let called = false;
  const hook = {
    async store(snapshot) {
      called = true;
      return { backupId: snapshot.backupId, encrypted: true };
    },
  };
  await assert.rejects(
    core.backupRuntimeState(request(f, hook)),
    failure('BACKUP_FAILED'),
  );
  assert.equal(called, false);
  assert.equal(f.state.getBackupFreshness().latestAttempt.outcome, 'failed');
});

test('backup errors cannot carry arbitrary caller-supplied code or identity values', () => {
  const error = new core.BackupError(
    'synthetic-backup-secret',
    'synthetic-backup-secret',
  );
  assert.equal(error.code, 'INVALID_BACKUP_OPTIONS');
  assert.doesNotMatch(JSON.stringify(error), /synthetic-backup-secret/);
});

test('failed success auditing cannot advance freshness and can still audit failure', async (t) => {
  const f = await fixture(t);
  const hook = {
    async store(snapshot) {
      const raw = new DatabaseSync(f.path);
      raw.exec(
        "CREATE TRIGGER reject_success BEFORE INSERT ON events WHEN NEW.type='backup.completed' BEGIN SELECT RAISE(ABORT,'synthetic-backup-secret'); END",
      );
      raw.close();
      return { backupId: snapshot.backupId, encrypted: true };
    },
  };
  await assert.rejects(
    core.backupRuntimeState(request(f, hook)),
    failure('BACKUP_AUDIT_FAILED'),
  );
  assert.equal(f.state.getBackupFreshness().status, 'never');
  assert.equal(f.state.getBackupFreshness().latestAttempt.outcome, 'failed');
  assert.deepEqual(
    f.state.listEvents().map((event) => event.type),
    ['backup.failed'],
  );
});

test('invalid backup options and receipt accessors are rejected without evaluation', async (t) => {
  const f = await fixture(t);
  let evaluated = false;
  await assert.rejects(
    core.backupRuntimeState({
      ...request(f, {}),
      token: 'synthetic-backup-secret',
    }),
    failure('INVALID_BACKUP_OPTIONS'),
  );
  assert.equal(f.state.getBackupFreshness().latestAttempt, null);
  const hook = {
    async store(snapshot) {
      const receipt = { backupId: snapshot.backupId };
      Object.defineProperty(receipt, 'encrypted', {
        enumerable: true,
        get() {
          evaluated = true;
          throw new Error('synthetic-backup-secret');
        },
      });
      return receipt;
    },
  };
  await assert.rejects(
    core.backupRuntimeState(request(f, hook)),
    failure('INVALID_BACKUP_RECEIPT'),
  );
  assert.equal(evaluated, false);
});

test('an independent WAL transaction cannot create a partially copied run/event pair', async (t) => {
  const f = await fixture(t);
  const output = join(f.root, 'concurrent.sqlite3');
  const pending = adapter.snapshotRuntimeState(f.state, output);
  const writer = new DatabaseSync(f.path, { timeout: 1000 });
  writer.exec('BEGIN IMMEDIATE');
  writer
    .prepare('INSERT INTO runs (id, worker_id, started_at) VALUES (?, ?, ?)')
    .run(sourceId, workerId, '2026-10-27T12:00:00.000Z');
  writer
    .prepare(
      'INSERT INTO events (id, type, actor_id, occurred_at, run_id) VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      destinationId,
      'run.started',
      actorId,
      '2026-10-27T12:00:00.000Z',
      sourceId,
    );
  writer.exec('COMMIT');
  writer.close();
  await pending;
  const restored = core.openRuntimeState({ path: output });
  t.after(() => restored.close());
  assert.deepEqual(restored.verifyIntegrity(), { ok: true });
  assert.equal(
    restored.getRun(sourceId) !== null,
    restored.listEvents().some((event) => event.runId === sourceId),
  );
});

test('late completion of an older snapshot cannot refresh the data age', async (t) => {
  const f = await fixture(t);
  const older = '55555555-5555-4555-8555-555555555555';
  const newer = '66666666-6666-4666-8666-666666666666';
  for (const [id, startedAt] of [
    [older, '2026-10-24T00:00:00.000Z'],
    [newer, '2026-10-25T00:00:00.000Z'],
  ]) {
    adapter.beginRuntimeBackup(f.state, {
      id,
      destinationId,
      actorId,
      startedAt,
    });
  }
  adapter.finishRuntimeBackup(f.state, {
    id: newer,
    outcome: 'succeeded',
    finishedAt: '2026-10-25T01:00:00.000Z',
  });
  adapter.finishRuntimeBackup(f.state, {
    id: older,
    outcome: 'succeeded',
    finishedAt: '2026-10-27T00:00:00.000Z',
  });
  const health = f.state.getBackupFreshness({
    now: '2026-10-27T01:00:00.000Z',
  });
  assert.equal(health.status, 'stale');
  assert.equal(health.ageMs, 49 * 60 * 60 * 1000);
  assert.equal(health.lastSnapshotStartedAt, '2026-10-25T00:00:00.000Z');
  assert.equal(health.lastSuccessAt, '2026-10-25T01:00:00.000Z');
});

test(
  'failed plaintext cleanup cannot claim success',
  { skip: process.geteuid?.() === 0 },
  async (t) => {
    const f = await fixture(t);
    let directory;
    try {
      await assert.rejects(
        core.backupRuntimeState(
          request(f, {
            async store({ backupId, snapshotPath }) {
              directory = dirname(snapshotPath);
              await chmod(directory, 0o000);
              return { backupId, encrypted: true };
            },
          }),
        ),
        failure('BACKUP_CLEANUP_FAILED'),
      );
      const attempt = f.state.getBackupFreshness().latestAttempt;
      assert.equal(attempt.outcome, 'failed');
      assert.equal(f.state.getBackupFreshness().status, 'never');
      assert.equal(f.state.listEvents().at(-1).type, 'backup.failed');
      assert.ok((await readdir(f.root)).includes(directory.split('/').at(-1)));
    } finally {
      if (directory) await chmod(directory, 0o700);
    }
  },
);
