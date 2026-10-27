import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';
import * as adapter from '../packages/state/dist/index.js';
import {
  applyMigrations,
  migrations,
} from '../packages/state/dist/migrations.js';
const actorId = '11111111-1111-4111-8111-111111111111';
const destinationId = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mz-doctor-state-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, path: join(root, 'runtime.sqlite3') };
}
test('inspection refuses missing databases without creating any files', async (t) => {
  const f = await fixture(t);
  assert.throws(
    () => core.inspectRuntimeState({ path: f.path }),
    (e) => e instanceof core.RuntimeStateError,
  );
  assert.deepEqual(await readdir(f.root), []);
});
test('inspection returns the same durable freshness policy without appending events', async (t) => {
  const f = await fixture(t);
  const state = core.openRuntimeState({ path: f.path });
  t.after(() => state.close());
  adapter.beginRuntimeBackup(state, {
    id,
    actorId,
    destinationId,
    startedAt: '2026-10-27T10:00:00.000Z',
  });
  adapter.finishRuntimeBackup(state, {
    id,
    outcome: 'succeeded',
    finishedAt: '2026-10-27T11:00:00.000Z',
  });
  const before = state.listEvents();
  for (const now of [
    '2026-10-27T09:00:00.000Z',
    '2026-10-27T12:00:00.000Z',
    '2026-10-29T12:00:00.000Z',
  ]) {
    const policy = { now, maxAgeMs: 86400000 };
    const result = core.inspectRuntimeState({ path: f.path, ...policy });
    assert.equal(result.schemaVersion, 3);
    assert.equal(result.journalMode, 'wal');
    assert.equal(result.integrity, 'ok');
    assert.deepEqual(result.backupFreshness, state.getBackupFreshness(policy));
  }
  assert.deepEqual(state.listEvents(), before);
});
for (const kind of [
  'v1',
  'empty',
  'foreign',
  'drifted',
  'corrupt',
  'non-wal',
  'broken-reference',
]) {
  test(`inspection rejects ${kind} state without migrating or repairing it`, async (t) => {
    const f = await fixture(t);
    const db = new DatabaseSync(f.path);
    if (kind === 'v1') applyMigrations(db, migrations.slice(0, 1));
    if (kind === 'foreign') db.exec('CREATE TABLE unrelated (id INTEGER)');
    if (kind === 'non-wal') applyMigrations(db);
    if (kind === 'broken-reference') {
      applyMigrations(db);
      db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=OFF');
      db.prepare(
        'INSERT INTO events (id, type, actor_id, occurred_at, run_id) VALUES (?, ?, ?, ?, ?)',
      ).run(
        id,
        'run.started',
        actorId,
        '2026-10-27T10:00:00.000Z',
        destinationId,
      );
    }
    if (kind === 'drifted') {
      applyMigrations(db);
      db.exec('DROP TRIGGER events_no_update');
    }
    db.close();
    if (kind === 'corrupt') await writeFile(f.path, 'not a SQLite database');
    const before = await readFile(f.path);
    assert.throws(
      () => core.inspectRuntimeState({ path: f.path }),
      (e) => e instanceof core.RuntimeStateError,
    );
    assert.deepEqual(await readFile(f.path), before);
  });
}
test('inspection rejects symlinks and invalid policy without exposing rejected values', async (t) => {
  const f = await fixture(t);
  core.openRuntimeState({ path: f.path }).close();
  const link = join(f.root, 'link');
  await symlink(f.path, link);
  for (const input of [
    { path: link },
    { path: 'synthetic-doctor-secret' },
    { path: f.path, maxAgeMs: 0 },
    { path: f.path, token: 'synthetic-doctor-secret' },
  ]) {
    assert.throws(
      () => core.inspectRuntimeState(input),
      (error) => {
        assert.ok(error instanceof core.RuntimeStateError);
        assert.doesNotMatch(
          JSON.stringify(error) + error.stack,
          /synthetic-doctor-secret/,
        );
        return true;
      },
    );
  }
});
