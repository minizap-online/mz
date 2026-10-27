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
const receivedAt = '2026-10-27T10:00:00.000Z';
const changedAt = '2026-10-27T12:00:00.000Z';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'mz-inbox-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'state.sqlite3');
  const state = core.openRuntimeState({ path });
  t.after(() => state.close());
  return { path, state };
}
function create(state, options = {}) {
  return state.createInboxItem({
    id,
    sourceId,
    actorId,
    receivedAt,
    intake: { sourceType: 'stdin', sourceBytes: 10, scope: 'company' },
    ...options,
  });
}

test('bounded inbox pages include legacy records and detached private inspection', (t) => {
  const { state } = fixture(t);
  create(state);
  const legacy = create(state, { id: sourceId, intake: undefined });
  const first = state.listInbox({ limit: 1 });
  assert.equal(first.length, 1);
  assert.equal(first[0].item.id, id);
  assert.equal(first[0].classification, 'unclassified');
  assert.equal(first[0].scope, 'company');
  assert.equal(first[0].triaged, false);
  assert.equal(first[0].revision, 0);
  assert.equal(first[0].lastChange, null);
  assert.equal(first[0].sourceRef, 'private-source:' + sourceId);
  assert.equal(first[0].summary, 'Summary pending');
  assert.equal(first[0].untrusted, true);
  const second = state.listInbox({
    afterSequence: first[0].sequence,
    limit: 1,
  });
  assert.equal(second[0].item.id, legacy.id);
  assert.equal(second[0].intake, null);
  assert.equal(second[0].scope, 'unclassified');
  assert.deepEqual(state.listInbox({ afterSequence: second[0].sequence }), []);
  const detail = state.getInboxDetails(id);
  detail.item.sourceId = actorId;
  detail.classification = 'other';
  assert.equal(state.getInboxDetails(id).item.sourceId, sourceId);
  assert.equal(state.getInboxDetails(id).classification, 'unclassified');
});
for (const classification of [
  'idea',
  'bug',
  'feature',
  'feedback',
  'decision',
  'reference',
  'other',
])
  test(`classify ${classification}, assign scope and mark reviewed with one linked audit`, (t) => {
    const { state } = fixture(t);
    create(state);
    const result = state.triageInboxItem({
      id,
      actorId,
      classification,
      scope: 'project:example',
      triaged: true,
      changedAt,
    });
    assert.equal(result.classification, classification);
    assert.equal(result.scope, 'project:example');
    assert.equal(result.triaged, true);
    assert.equal(result.revision, 1);
    assert.equal(result.intake.scope, 'company');
    const history = state.listInboxChanges({ inboxItemId: id });
    assert.equal(history.length, 1);
    assert.equal(history[0].revision, 1);
    assert.equal(history[0].actorId, actorId);
    assert.equal(history[0].changedAt, changedAt);
    assert.equal(history[0].scope, 'project:example');
    assert.equal(history[0].triaged, true);
    assert.deepEqual(result.lastChange, history[0]);
    const event = state.listEvents().at(-1);
    assert.equal(event.type, 'inbox.triaged');
    assert.equal(event.inboxItemId, id);
    assert.equal(event.id, history[0].eventId);
    assert.equal(event.actorId, actorId);
  });
test('partial patches, untriage, no-op and paged history preserve all revisions', (t) => {
  const { state } = fixture(t);
  create(state);
  state.triageInboxItem({ id, actorId, classification: 'idea', changedAt });
  assert.throws(
    () =>
      state.triageInboxItem({
        id,
        actorId,
        classification: 'bug',
        changedAt: '2026-10-27T11:00:00.000Z',
      }),
    (e) => e.code === 'INVALID_INPUT',
  );
  state.triageInboxItem({
    id,
    actorId: sourceId,
    scope: 'project-candidate',
    triaged: true,
    changedAt,
  });
  let result = state.triageInboxItem({
    id,
    actorId,
    triaged: false,
    changedAt,
  });
  assert.equal(result.classification, 'idea');
  assert.equal(result.scope, 'project-candidate');
  assert.equal(result.revision, 3);
  const before = state.listEvents();
  result = state.triageInboxItem({ id, actorId, triaged: false, changedAt });
  assert.equal(result.revision, 3);
  assert.deepEqual(state.listEvents(), before);
  const page = state.listInboxChanges({ inboxItemId: id, limit: 2 });
  assert.deepEqual(
    page.map((c) => c.revision),
    [1, 2],
  );
  assert.deepEqual(
    state
      .listInboxChanges({ inboxItemId: id, afterSequence: page[1].sequence })
      .map((c) => c.revision),
    [3],
  );
});
test('independent state connections merge partial patches against the latest committed snapshot', (t) => {
  const { state, path } = fixture(t);
  create(state);
  const other = core.openRuntimeState({ path });
  t.after(() => other.close());
  state.triageInboxItem({ id, actorId, classification: 'bug', changedAt });
  other.triageInboxItem({
    id,
    actorId: sourceId,
    scope: 'company',
    triaged: true,
    changedAt,
  });
  const view = state.getInboxDetails(id);
  assert.equal(view.classification, 'bug');
  assert.equal(view.triaged, true);
  assert.equal(view.revision, 2);
  assert.equal(view.lastChange.actorId, sourceId);
});
for (const table of ['events', 'inbox_triage_changes'])
  test(`failed ${table} insert rolls back event/history and effective view`, (t) => {
    const { state, path } = fixture(t);
    create(state);
    const db = new DatabaseSync(path);
    t.after(() => db.close());
    db.exec(
      `CREATE TRIGGER fail_change BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'synthetic-inbox-private'); END;`,
    );
    const before = state.getInboxDetails(id);
    const events = state.listEvents();
    assert.throws(() =>
      state.triageInboxItem({ id, actorId, classification: 'idea', changedAt }),
    );
    assert.deepEqual(state.getInboxDetails(id), before);
    assert.deepEqual(state.listEvents(), events);
    assert.deepEqual(state.listInboxChanges({ inboxItemId: id }), []);
  });
test('triage snapshots resist update/delete/REPLACE even with recursive triggers disabled', (t) => {
  const { state, path } = fixture(t);
  create(state);
  state.triageInboxItem({ id, actorId, classification: 'idea', changedAt });
  const db = new DatabaseSync(path);
  t.after(() => db.close());
  db.exec('PRAGMA recursive_triggers=OFF');
  for (const sql of [
    "UPDATE inbox_triage_changes SET classification='other'",
    'DELETE FROM inbox_triage_changes',
    'INSERT OR REPLACE INTO inbox_triage_changes SELECT * FROM inbox_triage_changes',
  ])
    assert.throws(() => db.exec(sql));
  assert.equal(state.getInboxDetails(id).classification, 'idea');
  assert.equal(state.listInboxChanges({ inboxItemId: id }).length, 1);
});
test('invalid patches, timestamps and cursors fail safely without partial history', (t) => {
  const { state } = fixture(t);
  create(state);
  for (const patch of [
    {},
    { classification: 'synthetic-inbox-private' },
    { scope: 'project:../escape' },
    { triaged: 'true' },
    { scope: undefined },
    { changedAt: '2026-10-26T00:00:00.000Z', triaged: true },
    { classification: 'idea', body: 'synthetic-inbox-private' },
  ]) {
    assert.throws(
      () => state.triageInboxItem({ id, actorId, ...patch }),
      (e) => {
        assert.ok(e instanceof core.RuntimeStateError);
        assert.equal(e.code, 'INVALID_INPUT');
        assert.doesNotMatch(
          JSON.stringify(e) + e.stack,
          /synthetic-inbox-private/,
        );
        return true;
      },
    );
  }
  for (const cursor of [
    { limit: 0 },
    { limit: 1001 },
    { afterSequence: -1 },
    { token: 'synthetic-inbox-private' },
  ])
    assert.throws(
      () => state.listInbox(cursor),
      (e) => e.code === 'INVALID_INPUT',
    );
  assert.deepEqual(state.listInboxChanges({ inboxItemId: id }), []);
  assert.equal(state.listEvents().length, 1);
  assert.equal(state.getInboxDetails(actorId), null);
  assert.throws(
    () => state.triageInboxItem({ id: actorId, actorId, triaged: true }),
    (e) => e.code === 'INBOX_NOT_FOUND',
  );
});
test('scoped triage is atomic, expires with its transaction and preserves history on v3 upgrade', (t) => {
  const { state, path } = fixture(t);
  state.close();
  rmSync(path);
  const db = new DatabaseSync(path);
  applyMigrations(db, migrations.slice(0, 3));
  db.prepare('INSERT INTO inbox_items VALUES (?, ?, ?)').run(
    id,
    sourceId,
    receivedAt,
  );
  db.prepare(
    'INSERT INTO inbox_intake (inbox_item_id,source_type,source_bytes,scope,created_by) VALUES (?, ?, ?, ?, ?)',
  ).run(id, 'file', 10, 'company', actorId);
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
  assert.equal(upgraded.getInboxDetails(id).scope, 'company');
  let saved;
  upgraded.transaction((tx) => {
    saved = tx;
    tx.triageInboxItem({ id, actorId, classification: 'reference', changedAt });
    assert.equal(tx.getInboxDetails(id).revision, 1);
  });
  assert.throws(
    () => saved.getInboxDetails(id),
    (e) => e.code === 'EXPIRED_TRANSACTION',
  );
  assert.equal(upgraded.getInboxDetails(id).classification, 'reference');
  assert.equal(upgraded.getInboxIntake(id).sourceType, 'file');
  assert.equal(upgraded.getBackup(sourceId).outcome, 'succeeded');
  assert.equal(upgraded.listEvents()[0].id, actorId);
  assert.equal(upgraded.listEvents()[0].backupId, sourceId);
  assert.deepEqual(upgraded.verifyIntegrity(), { ok: true });
});
