import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';
import {
  applyMigrations,
  migrations,
} from '../packages/state/dist/migrations.js';
const actorId = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const receivedAt = '2026-10-27T12:00:00.000Z';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'mz-intake-state-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'state.sqlite3');
  const state = core.openRuntimeState({ path });
  t.after(() => state.close());
  return { path, state };
}
for (const scope of [
  'unclassified',
  'company',
  'project-candidate',
  'project:example-project',
]) {
  test(`structural intake metadata and created event commit atomically for ${scope}`, (t) => {
    const { state } = fixture(t);
    const item = state.createInboxItem({
      id,
      sourceId,
      actorId,
      receivedAt,
      intake: { sourceType: 'stdin', sourceBytes: 37, scope },
    });
    assert.deepEqual(item, { id, sourceId, receivedAt });
    assert.deepEqual(state.getInboxIntake(id), {
      inboxItemId: id,
      sourceType: 'stdin',
      sourceBytes: 37,
      scope,
      createdBy: actorId,
      summaryStatus: 'pending',
    });
    const event = state.listEvents()[0];
    assert.equal(event.type, 'inbox.created');
    assert.equal(event.actorId, actorId);
    assert.equal(event.inboxItemId, id);
  });
}
test('legacy inbox records remain compatible and have no intake metadata', (t) => {
  const { state } = fixture(t);
  const item = state.createInboxItem({ sourceId, actorId });
  assert.equal(state.getInboxIntake(item.id), null);
});
test('invalid intake fields and scope fail without inbox, metadata or event', (t) => {
  const { state } = fixture(t);
  for (const intake of [
    { sourceType: 'chat', sourceBytes: 2 },
    { sourceType: 'file', sourceBytes: 0 },
    { sourceType: 'stdin', sourceBytes: 1048577 },
    { sourceType: 'file', sourceBytes: 1, scope: 'project:../escape' },
    { sourceType: 'file', sourceBytes: 1, summary: 'synthetic-intake-secret' },
  ]) {
    assert.throws(
      () => state.createInboxItem({ id, sourceId, actorId, intake }),
      (e) => e.code === 'INVALID_INPUT',
    );
    assert.equal(state.getInboxItem(id), null);
    assert.equal(state.getInboxIntake(id), null);
    assert.deepEqual(state.listEvents(), []);
  }
});
test('failure writing created event rolls back inbox and intake metadata', (t) => {
  const { path, state } = fixture(t);
  const db = new DatabaseSync(path);
  t.after(() => db.close());
  db.exec(
    "CREATE TRIGGER reject_created BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'fixture_failure'); END;",
  );
  assert.throws(() =>
    state.createInboxItem({
      id,
      sourceId,
      actorId,
      intake: { sourceType: 'file', sourceBytes: 3, scope: 'company' },
    }),
  );
  assert.equal(state.getInboxItem(id), null);
  assert.equal(state.getInboxIntake(id), null);
  assert.deepEqual(state.listEvents(), []);
});
test('migration v2 to current schema preserves actual inbox, backup and linked event history', (t) => {
  const { path, state } = fixture(t);
  state.close();
  rmSync(path);
  const db = new DatabaseSync(path);
  applyMigrations(db, migrations.slice(0, 2));
  db.prepare('INSERT INTO inbox_items VALUES (?, ?, ?)').run(
    id,
    sourceId,
    receivedAt,
  );
  db.prepare('INSERT INTO backups VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    sourceId,
    actorId,
    actorId,
    receivedAt,
    receivedAt,
    'succeeded',
    1,
  );
  db.prepare(
    'INSERT INTO events (id,type,actor_id,occurred_at,inbox_item_id,backup_id) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(actorId, 'backup.completed', actorId, receivedAt, id, sourceId);
  db.close();
  const upgraded = core.openRuntimeState({ path });
  t.after(() => upgraded.close());
  assert.equal(upgraded.getStatus().schemaVersion, 5);
  assert.deepEqual(upgraded.getInboxItem(id), { id, sourceId, receivedAt });
  assert.equal(upgraded.getInboxIntake(id), null);
  assert.equal(upgraded.getBackup(sourceId).outcome, 'succeeded');
  assert.equal(upgraded.listEvents()[0].inboxItemId, id);
  assert.equal(upgraded.listEvents()[0].backupId, sourceId);
  assert.equal(upgraded.listEvents()[0].sequence, 1);
  assert.deepEqual(upgraded.verifyIntegrity(), { ok: true });
});
