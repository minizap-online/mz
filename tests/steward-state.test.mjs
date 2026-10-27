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
const workerId = '22222222-2222-4222-8222-222222222222';
const sourceId = '33333333-3333-4333-8333-333333333333';
const id = '44444444-4444-4444-8444-444444444444';
const approvalId = '55555555-5555-4555-8555-555555555555';
const startedAt = '2026-10-27T10:00:00.000Z';
const finishedAt = '2026-10-27T11:00:00.000Z';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'mz-steward-state-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'state.sqlite3');
  const state = core.openRuntimeState({ path });
  t.after(() => state.close());
  return { path, state };
}
function start(state, extra = {}) {
  return state.startStewardInteraction({
    id,
    sourceId,
    actorId,
    workerId,
    scope: 'project:alpha',
    startedAt,
    ...extra,
  });
}
test('steward interaction/run lifecycle and structural decision references persist with audit', (t) => {
  const { state } = fixture(t);
  const pending = start(state);
  assert.equal(pending.outcome, null);
  assert.equal(state.getRun(pending.runId).workerId, workerId);
  assert.equal(state.listEvents()[0].type, 'run.started');
  const done = state.finishStewardInteraction({
    id,
    actorId,
    outcome: 'succeeded',
    finishedAt,
  });
  assert.equal(done.outcome, 'succeeded');
  assert.equal(done.finishedAt, finishedAt);
  assert.equal(state.listEvents().at(-1).type, 'run.finished');
  const decision = state.recordStewardDecision({
    interactionId: id,
    proposalIndex: 0,
    actorId,
    approvalId,
    recordedAt: finishedAt,
  });
  assert.equal(decision.approvalId, approvalId);
  assert.equal(decision.knowledgeId, 'decision-' + decision.id);
  assert.equal(state.listEvents().at(-1).type, 'decision.recorded');
  assert.equal(state.listEvents().at(-1).id, decision.eventId);
  assert.equal(state.listEvents().at(-1).runId, pending.runId);
  assert.equal(state.getStewardInteraction(id).sourceId, sourceId);
  assert.equal(
    state.listStewardInteractions({ scope: 'project:alpha' }).length,
    1,
  );
  assert.deepEqual(
    state.listStewardInteractions({ scope: 'project:beta' }),
    [],
  );
  assert.equal(
    state.listStewardDecisions({ scope: 'project:alpha' }).length,
    1,
  );
});
test('failed interaction can be recorded but cannot claim an approved decision', (t) => {
  const { state } = fixture(t);
  start(state);
  state.finishStewardInteraction({
    id,
    actorId,
    outcome: 'failed',
    finishedAt,
  });
  assert.throws(
    () =>
      state.recordStewardDecision({
        interactionId: id,
        proposalIndex: 0,
        actorId,
        approvalId,
      }),
    (e) => e.code === 'INVALID_INPUT',
  );
  assert.deepEqual(state.listStewardDecisions({}), []);
});
for (const table of ['steward_interactions', 'events'])
  test(`interaction start rollback on ${table} insertion failure`, (t) => {
    const { state, path } = fixture(t);
    const db = new DatabaseSync(path);
    t.after(() => db.close());
    db.exec(
      `CREATE TRIGGER fixture_fail BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'synthetic-steward-private'); END;`,
    );
    assert.throws(() => start(state));
    assert.equal(state.getStewardInteraction(id), null);
    assert.deepEqual(state.listEvents(), []);
    assert.equal(db.prepare('SELECT count(*) AS n FROM runs').get().n, 0);
  });
for (const table of ['steward_decisions', 'events'])
  test(`decision/event rollback on ${table} failure`, (t) => {
    const { state, path } = fixture(t);
    start(state);
    state.finishStewardInteraction({
      id,
      actorId,
      outcome: 'succeeded',
      finishedAt,
    });
    const before = state.listEvents();
    const db = new DatabaseSync(path);
    t.after(() => db.close());
    db.exec(
      `CREATE TRIGGER fixture_fail BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'fixture'); END;`,
    );
    assert.throws(() =>
      state.recordStewardDecision({
        interactionId: id,
        proposalIndex: 0,
        actorId,
        approvalId,
        recordedAt: finishedAt,
      }),
    );
    assert.deepEqual(state.listEvents(), before);
    assert.deepEqual(state.listStewardDecisions({}), []);
  });
test('structural interaction/decision references reject updates/deletes/replacements', (t) => {
  const { state, path } = fixture(t);
  start(state);
  state.finishStewardInteraction({
    id,
    actorId,
    outcome: 'succeeded',
    finishedAt,
  });
  state.recordStewardDecision({
    interactionId: id,
    proposalIndex: 0,
    actorId,
    approvalId,
    recordedAt: finishedAt,
  });
  const db = new DatabaseSync(path);
  t.after(() => db.close());
  db.exec('PRAGMA recursive_triggers=OFF');
  for (const table of ['steward_interactions', 'steward_decisions'])
    for (const sql of [
      `DELETE FROM ${table}`,
      `UPDATE ${table} SET actor_id = actor_id`,
      `INSERT OR REPLACE INTO ${table} SELECT * FROM ${table}`,
    ])
      assert.throws(() => db.exec(sql));
  assert.equal(state.listStewardInteractions({}).length, 1);
  assert.equal(state.listStewardDecisions({}).length, 1);
});
test('scope/cursors/content are validated and interactions remain metadata only', (t) => {
  const { state } = fixture(t);
  for (const extra of [
    { scope: 'project:../escape' },
    { question: 'synthetic-steward-private' },
    { scope: 'unclassified' },
  ])
    assert.throws(
      () => start(state, extra),
      (e) => e.code === 'INVALID_INPUT',
    );
  assert.deepEqual(state.listEvents(), []);
  start(state);
  assert.throws(
    () => state.listStewardInteractions({ limit: 1001 }),
    (e) => e.code === 'INVALID_INPUT',
  );
  assert.throws(
    () => state.listStewardInteractions({ scope: 'project:../x' }),
    (e) => e.code === 'INVALID_INPUT',
  );
  assert.doesNotMatch(
    JSON.stringify(state.listStewardInteractions({})),
    /synthetic-steward-private/,
  );
});
test('actual v4 inbox/triage/backup history upgrades without mutation', (t) => {
  const { state, path } = fixture(t);
  state.close();
  rmSync(path);
  const db = new DatabaseSync(path);
  applyMigrations(db, migrations.slice(0, 4));
  db.prepare('INSERT INTO inbox_items VALUES (?, ?, ?)').run(
    id,
    sourceId,
    startedAt,
  );
  db.prepare('INSERT INTO backups VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    sourceId,
    actorId,
    actorId,
    startedAt,
    finishedAt,
    'succeeded',
    1,
  );
  db.prepare(
    'INSERT INTO events (id,type,actor_id,occurred_at,inbox_item_id,backup_id) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(actorId, 'backup.completed', actorId, finishedAt, id, sourceId);
  db.prepare('INSERT INTO inbox_intake VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    'stdin',
    12,
    'company',
    actorId,
    'pending',
  );
  db.prepare(
    'INSERT INTO events (id,type,actor_id,occurred_at,inbox_item_id) VALUES (?, ?, ?, ?, ?)',
  ).run(workerId, 'inbox.triaged', actorId, finishedAt, id);
  db.prepare(
    'INSERT INTO inbox_triage_changes (id,inbox_item_id,revision,actor_id,changed_at,classification,scope,triaged,event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    approvalId,
    id,
    1,
    actorId,
    finishedAt,
    'idea',
    'project:alpha',
    1,
    workerId,
  );
  db.close();
  const upgraded = core.openRuntimeState({ path });
  t.after(() => upgraded.close());
  assert.equal(upgraded.getStatus().schemaVersion, 5);
  assert.equal(upgraded.getInboxItem(id).sourceId, sourceId);
  assert.equal(upgraded.getInboxDetails(id).scope, 'project:alpha');
  assert.equal(upgraded.getInboxDetails(id).triaged, true);
  assert.equal(upgraded.listInboxChanges({ inboxItemId: id }).length, 1);
  assert.equal(upgraded.getBackup(sourceId).outcome, 'succeeded');
  assert.equal(upgraded.listEvents()[0].id, actorId);
  assert.deepEqual(upgraded.listStewardInteractions({}), []);
  assert.deepEqual(upgraded.verifyIntegrity(), { ok: true });
});
