import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';

const actor = '11111111-1111-4111-8111-111111111111';
const worker = '22222222-2222-4222-8222-222222222222';
const source = '33333333-3333-4333-8333-333333333333';
const runId = '44444444-4444-4444-8444-444444444444';
const eventId = '55555555-5555-4555-8555-555555555555';
const inboxId = '66666666-6666-4666-8666-666666666666';
const time = '2026-10-27T12:00:00.000Z';
const later = '2026-10-27T12:01:00.000Z';
const event = { type: 'decision.recorded', actorId: actor, occurredAt: time };
function location(t) {
  const dir = mkdtempSync(join(tmpdir(), 'mz-state-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'state.sqlite3');
}
function setup(t) {
  const path = location(t);
  const state = core.openRuntimeState({ path });
  t.after(() => state.close());
  return { path, state };
}
function rejected(code) {
  return (error) => {
    assert.ok(error instanceof core.RuntimeStateError);
    assert.equal(error.code, code);
    assert.doesNotMatch(
      JSON.stringify(error) + error.stack,
      /synthetic-credential-marker/,
    );
    return true;
  };
}
function raw(t, path) {
  const db = new DatabaseSync(path);
  t.after(() => db.close());
  return db;
}

test('Core creates a private WAL database with versioned event/inbox/run storage', (t) => {
  const { state, path } = setup(t);
  assert.deepEqual(state.getStatus(), {
    schemaVersion: 4,
    journalMode: 'wal',
    foreignKeys: true,
  });
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const db = raw(t, path);
  const names = db
    .prepare("SELECT name FROM sqlite_schema WHERE type='table'")
    .all()
    .map((r) => r.name);
  for (const name of ['schema_migrations', 'events', 'inbox_items', 'runs'])
    assert.ok(names.includes(name));
  const ledger = db
    .prepare('SELECT version, name, checksum FROM schema_migrations')
    .all();
  assert.equal(ledger.length, 4);
  assert.equal(ledger[0].version, 1);
  assert.match(ledger[0].checksum, /^[a-f0-9]{64}$/);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
  assert.equal(
    'database' in state || 'exec' in state || 'prepare' in state,
    false,
  );
});

test('reopen preserves records and applies each migration only once', (t) => {
  const { state, path } = setup(t);
  const added = state.appendEvent({ ...event, id: eventId });
  state.close();
  const reopened = core.openRuntimeState({ path });
  t.after(() => reopened.close());
  assert.deepEqual(reopened.listEvents(), [added]);
  assert.equal(
    raw(t, path).prepare('SELECT count(*) AS n FROM schema_migrations').get().n,
    4,
  );
});

test('event cursor pagination follows append sequence, independent of timestamps', (t) => {
  const { state } = setup(t);
  const first = state.appendEvent({ ...event, occurredAt: later });
  const second = state.appendEvent(event);
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.deepEqual(state.listEvents({ limit: 1 }), [first]);
  assert.deepEqual(state.listEvents({ afterSequence: 1, limit: 10 }), [second]);
  assert.deepEqual(state.listEvents({ afterSequence: 2 }), []);
  assert.equal(first.runId, null);
  assert.equal(first.inboxItemId, null);
});

test('creates inbox metadata and its audit event atomically', (t) => {
  const { state } = setup(t);
  const item = state.createInboxItem({
    id: inboxId,
    sourceId: source,
    actorId: actor,
    receivedAt: time,
  });
  assert.deepEqual(item, { id: inboxId, sourceId: source, receivedAt: time });
  assert.deepEqual(state.getInboxItem(inboxId), item);
  const [audit] = state.listEvents();
  assert.equal(audit.type, 'inbox.created');
  assert.equal(audit.actorId, actor);
  assert.equal(audit.inboxItemId, inboxId);
  assert.equal(audit.occurredAt, time);
});

test('starts and finishes runs with one terminal outcome and matching audit events', (t) => {
  const { state } = setup(t);
  const run = state.startRun({
    id: runId,
    workerId: worker,
    actorId: actor,
    startedAt: time,
  });
  assert.deepEqual(run, {
    id: runId,
    workerId: worker,
    startedAt: time,
    finishedAt: null,
    outcome: null,
  });
  const finished = state.finishRun({
    id: run.id,
    actorId: actor,
    outcome: 'succeeded',
    finishedAt: later,
  });
  assert.deepEqual(state.getRun(run.id), finished);
  assert.equal(finished.outcome, 'succeeded');
  assert.equal(finished.finishedAt, later);
  assert.deepEqual(
    state.listEvents().map((e) => e.type),
    ['run.started', 'run.finished'],
  );
  assert.throws(
    () => state.finishRun({ id: run.id, actorId: actor, outcome: 'failed' }),
    rejected('RUN_FINISHED'),
  );
  assert.equal(state.listEvents().length, 2);
});

test('missing runs and finish-before-start fail without new audit records', (t) => {
  const { state } = setup(t);
  assert.equal(state.getRun(runId), null);
  assert.equal(state.getInboxItem(inboxId), null);
  assert.throws(
    () => state.finishRun({ id: runId, actorId: actor, outcome: 'failed' }),
    rejected('RUN_NOT_FOUND'),
  );
  state.startRun({
    id: runId,
    workerId: worker,
    actorId: actor,
    startedAt: later,
  });
  assert.throws(
    () =>
      state.finishRun({
        id: runId,
        actorId: actor,
        outcome: 'failed',
        finishedAt: time,
      }),
    rejected('INVALID_INPUT'),
  );
  assert.equal(state.getRun(runId).outcome, null);
  assert.equal(state.listEvents().length, 1);
});

test('automatic identifiers and UTC timestamps are generated for record/audit pairs', (t) => {
  const { state } = setup(t);
  const item = state.createInboxItem({ sourceId: source, actorId: actor });
  assert.match(item.id, /^[a-f0-9-]{36}$/);
  assert.equal(new Date(item.receivedAt).toISOString(), item.receivedAt);
  const audit = state.listEvents()[0];
  assert.notEqual(audit.id, item.id);
  assert.equal(audit.occurredAt, item.receivedAt);
});

test('transactions commit related records and their audit events together', (t) => {
  const { state } = setup(t);
  const answer = state.transaction((tx) => {
    tx.createInboxItem({
      id: inboxId,
      sourceId: source,
      actorId: actor,
      receivedAt: time,
    });
    tx.startRun({
      id: runId,
      workerId: worker,
      actorId: actor,
      startedAt: time,
    });
    tx.appendEvent({ ...event, runId, inboxItemId: inboxId });
    assert.equal(tx.listEvents().length, 3);
    return 42;
  });
  assert.equal(answer, 42);
  assert.equal(state.getRun(runId).id, runId);
  assert.equal(state.getInboxItem(inboxId).id, inboxId);
  assert.equal(state.listEvents().length, 3);
});

test('callback exceptions roll back records and audit history without leaking callback text', (t) => {
  const { state } = setup(t);
  assert.throws(
    () =>
      state.transaction((tx) => {
        tx.createInboxItem({ id: inboxId, sourceId: source, actorId: actor });
        tx.startRun({ id: runId, workerId: worker, actorId: actor });
        throw new Error('synthetic-credential-marker');
      }),
    rejected('TRANSACTION_FAILED'),
  );
  assert.equal(state.getInboxItem(inboxId), null);
  assert.equal(state.getRun(runId), null);
  assert.deepEqual(state.listEvents(), []);
  state.appendEvent(event);
  assert.equal(state.listEvents().length, 1);
});

test('a caught failed operation still poisons and rolls back its entire transaction', (t) => {
  const { state } = setup(t);
  assert.throws(
    () =>
      state.transaction((tx) => {
        tx.appendEvent({ ...event, id: eventId });
        try {
          tx.appendEvent({ ...event, id: eventId });
        } catch {
          /* cannot commit a partial batch */
        }
      }),
    rejected('TRANSACTION_FAILED'),
  );
  assert.deepEqual(state.listEvents(), []);
});

test('transaction scopes expire, async/thenable callbacks and nested transactions fail', (t) => {
  const { state } = setup(t);
  let escaped;
  state.transaction((tx) => {
    escaped = tx;
  });
  assert.throws(
    () => escaped.appendEvent(event),
    rejected('EXPIRED_TRANSACTION'),
  );
  let invoked = false;
  assert.throws(
    () =>
      state.transaction(async () => {
        invoked = true;
      }),
    rejected('INVALID_INPUT'),
  );
  assert.equal(invoked, false);
  assert.throws(
    () =>
      state.transaction((tx) => {
        tx.appendEvent(event);
        return Promise.resolve();
      }),
    rejected('INVALID_INPUT'),
  );
  assert.throws(
    () => state.transaction(() => state.transaction(() => 1)),
    rejected('TRANSACTION_ACTIVE'),
  );
  assert.throws(
    () =>
      state.transaction((tx) => {
        tx.appendEvent(event);
        state.appendEvent(event);
      }),
    rejected('TRANSACTION_ACTIVE'),
  );
  assert.deepEqual(state.listEvents(), []);
});

test('closing the outer state during a transaction fails and rolls it back', (t) => {
  const { state } = setup(t);
  assert.throws(
    () =>
      state.transaction((tx) => {
        tx.appendEvent(event);
        state.close();
      }),
    rejected('TRANSACTION_ACTIVE'),
  );
  assert.deepEqual(state.listEvents(), []);
});

test('foreign event references and duplicate IDs fail safely without replacing existing records', (t) => {
  const { state } = setup(t);
  assert.throws(
    () => state.appendEvent({ ...event, runId }),
    rejected('STATE_CONFLICT'),
  );
  const original = state.appendEvent({ ...event, id: eventId });
  assert.throws(
    () => state.appendEvent({ ...event, id: eventId }),
    rejected('STATE_CONFLICT'),
  );
  assert.deepEqual(state.listEvents(), [original]);
});

test('SQLite rejects event UPDATE, DELETE and REPLACE even with recursive triggers disabled', (t) => {
  const { state, path } = setup(t);
  const original = state.appendEvent({ ...event, id: eventId });
  const db = raw(t, path);
  db.exec('PRAGMA recursive_triggers=OFF');
  for (const sql of [
    'UPDATE events SET type = type',
    'DELETE FROM events',
    'INSERT OR REPLACE INTO events SELECT * FROM events',
  ])
    assert.throws(() => db.exec(sql));
  assert.deepEqual(state.listEvents(), [original]);
});

test('failure writing an automatic audit event rolls back its associated record', (t) => {
  const { state, path } = setup(t);
  raw(t, path).exec(
    "CREATE TRIGGER reject_inbox_audit BEFORE INSERT ON events WHEN NEW.type='inbox.created' BEGIN SELECT RAISE(ABORT,'audit failure'); END",
  );
  assert.throws(
    () =>
      state.createInboxItem({ id: inboxId, sourceId: source, actorId: actor }),
    rejected('STATE_CONFLICT'),
  );
  assert.equal(state.getInboxItem(inboxId), null);
  assert.deepEqual(state.listEvents(), []);
});

test('a WAL reader sees only committed changes', (t) => {
  const { state, path } = setup(t);
  const reader = raw(t, path);
  state.transaction((tx) => {
    tx.appendEvent(event);
    assert.equal(reader.prepare('SELECT count(*) AS n FROM events').get().n, 0);
  });
  assert.equal(reader.prepare('SELECT count(*) AS n FROM events').get().n, 1);
});

test('writer contention fails within the busy timeout and permits later recovery', (t) => {
  const { state, path } = setup(t);
  const other = raw(t, path);
  other.exec('BEGIN IMMEDIATE');
  try {
    assert.throws(() => state.appendEvent(event), rejected('STATE_BUSY'));
  } finally {
    other.exec('ROLLBACK');
  }
  assert.deepEqual(state.listEvents(), []);
  state.appendEvent(event);
  assert.equal(state.listEvents().length, 1);
});

for (const [name, input] of [
  [
    'unknown payload',
    { ...event, payload: { token: 'synthetic-credential-marker' } },
  ],
  ['unknown scalar field', { ...event, token: 'synthetic-credential-marker' }],
  ['unknown event type', { ...event, type: 'synthetic-credential-marker' }],
  ['non-UUID actor', { ...event, actorId: 'synthetic-credential-marker' }],
  ['invalid timestamp', { ...event, occurredAt: '2026-02-30T12:00:00.000Z' }],
  ['noncanonical time', { ...event, occurredAt: '2026-10-27T12:00:00Z' }],
  ['inherited record', Object.create(event)],
]) {
  test(`rejects ${name} before writing anything`, (t) => {
    const { state, path } = setup(t);
    assert.throws(() => state.appendEvent(input), rejected('INVALID_INPUT'));
    assert.deepEqual(state.listEvents(), []);
    state.close();
    for (const file of readdirSync(join(path, '..'))) {
      assert.equal(
        readFileSync(join(path, '..', file)).includes(
          Buffer.from('synthetic-credential-marker'),
        ),
        false,
      );
    }
  });
}

for (const options of [
  { limit: 0 },
  { limit: 1001 },
  { afterSequence: -1 },
  { afterSequence: 0.5 },
  { status: 'Ready' },
]) {
  test(`rejects invalid event cursor ${JSON.stringify(options)}`, (t) => {
    const { state } = setup(t);
    assert.throws(() => state.listEvents(options), rejected('INVALID_INPUT'));
  });
}

test('a source object getter is rejected without evaluating it', (t) => {
  const { state } = setup(t);
  let evaluated = false;
  const input = { ...event };
  Object.defineProperty(input, 'id', {
    enumerable: true,
    get() {
      evaluated = true;
      throw new Error('synthetic-credential-marker');
    },
  });
  assert.throws(() => state.appendEvent(input), rejected('INVALID_INPUT'));
  assert.equal(evaluated, false);
});

test('close is idempotent and operations after close fail with a stable code', (t) => {
  const { state } = setup(t);
  state.close();
  state.close();
  assert.throws(() => state.appendEvent(event), rejected('STATE_CLOSED'));
  assert.throws(() => state.getStatus(), rejected('STATE_CLOSED'));
  assert.throws(() => state.transaction(() => 1), rejected('STATE_CLOSED'));
});

test('invalid database locations are rejected without choosing a fallback', (t) => {
  const path = location(t);
  for (const candidate of [
    ':memory:',
    'relative.sqlite3',
    '',
    join(path, 'missing'),
  ]) {
    assert.throws(
      () => core.openRuntimeState({ path: candidate }),
      rejected(candidate.startsWith('/') ? 'STATE_IO_ERROR' : 'INVALID_PATH'),
    );
  }
  const original = core.openRuntimeState({ path });
  original.close();
  const link = path + '.link';
  symlinkSync(path, link);
  assert.throws(
    () => core.openRuntimeState({ path: link }),
    rejected('INVALID_PATH'),
  );
});

test('foreign databases are refused without changing their schema or journal mode', (t) => {
  const path = location(t);
  const db = raw(t, path);
  db.exec(
    "CREATE TABLE unrelated (value TEXT); INSERT INTO unrelated VALUES ('keep')",
  );
  const before = db.prepare('PRAGMA journal_mode').get().journal_mode;
  assert.throws(
    () => core.openRuntimeState({ path }),
    rejected('UNSUPPORTED_DATABASE'),
  );
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, before);
  assert.equal(db.prepare('SELECT value FROM unrelated').get().value, 'keep');
});

test('future versions, modified migration checksums, and missing audit triggers are rejected', (t) => {
  for (const alteration of [
    'PRAGMA user_version=99',
    "UPDATE schema_migrations SET checksum='bad'",
    'DROP TRIGGER events_no_update',
  ]) {
    const path = location(t);
    const state = core.openRuntimeState({ path });
    state.close();
    const db = raw(t, path);
    db.exec(alteration);
    assert.throws(
      () => core.openRuntimeState({ path }),
      rejected('SCHEMA_MISMATCH'),
    );
  }
});

test('callback metadata getters and forged state errors cannot leak callback values', (t) => {
  const { state } = setup(t);
  const callback = () => 1;
  Object.defineProperty(callback, 'constructor', {
    get() {
      throw new Error('synthetic-credential-marker');
    },
  });
  assert.throws(() => state.transaction(callback), rejected('INVALID_INPUT'));
  assert.throws(
    () =>
      state.transaction(() => {
        throw new core.RuntimeStateError(
          'TRANSACTION_FAILED',
          'synthetic-credential-marker',
        );
      }),
    rejected('TRANSACTION_FAILED'),
  );
});

test('hostile initialization object traps are sanitized before opening a database', () => {
  const options = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error('synthetic-credential-marker');
      },
    },
  );
  assert.throws(
    () => core.openRuntimeState(options),
    rejected('INVALID_INPUT'),
  );
});

test('finishing a run rolls back its update if the audit insert fails', (t) => {
  const { state, path } = setup(t);
  const original = state.startRun({
    id: runId,
    workerId: worker,
    actorId: actor,
    startedAt: time,
  });
  raw(t, path).exec(
    "CREATE TRIGGER reject_finish_audit BEFORE INSERT ON events WHEN NEW.type='run.finished' BEGIN SELECT RAISE(ABORT,'audit failure'); END",
  );
  assert.throws(
    () =>
      state.finishRun({
        id: runId,
        actorId: actor,
        outcome: 'failed',
        finishedAt: later,
      }),
    rejected('STATE_CONFLICT'),
  );
  assert.deepEqual(state.getRun(runId), original);
  assert.deepEqual(
    state.listEvents().map((e) => e.type),
    ['run.started'],
  );
});

test('returned records are detached and all enumerated events satisfy the SQL schema', (t) => {
  const { state } = setup(t);
  const run = state.startRun({ workerId: worker, actorId: actor });
  run.outcome = 'failed';
  assert.equal(state.getRun(run.id).outcome, null);
  for (const type of core.RUNTIME_EVENT_TYPES)
    state.appendEvent({ type, actorId: actor });
  assert.equal(state.listEvents().length, core.RUNTIME_EVENT_TYPES.length + 1);
  const read = state.listEvents();
  read[0].type = 'invalid';
  assert.equal(state.listEvents()[0].type, 'run.started');
});

test('inbox and run APIs reject arbitrary content fields without storing credential markers', (t) => {
  const { state } = setup(t);
  assert.throws(
    () =>
      state.createInboxItem({
        sourceId: source,
        actorId: actor,
        body: 'synthetic-credential-marker',
      }),
    rejected('INVALID_INPUT'),
  );
  assert.throws(
    () =>
      state.startRun({
        workerId: worker,
        actorId: actor,
        credentials: 'synthetic-credential-marker',
      }),
    rejected('INVALID_INPUT'),
  );
  const run = state.startRun({ workerId: worker, actorId: actor });
  assert.throws(
    () =>
      state.finishRun({
        id: run.id,
        actorId: actor,
        outcome: 'failed',
        error: 'synthetic-credential-marker',
      }),
    rejected('INVALID_INPUT'),
  );
  assert.equal(state.getRun(run.id).outcome, null);
  assert.equal(state.listEvents().length, 1);
});

test('a replaced audit trigger with the original name still fails schema verification', (t) => {
  const { state, path } = setup(t);
  state.close();
  const db = raw(t, path);
  db.exec(
    'DROP TRIGGER events_no_update; CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT 1; END;',
  );
  assert.throws(
    () => core.openRuntimeState({ path }),
    rejected('SCHEMA_MISMATCH'),
  );
});

test('a foreign table resembling SQLite internal names is never treated as an empty database', (t) => {
  const path = location(t);
  const db = raw(t, path);
  db.exec('CREATE TABLE sqliteXprivate (value TEXT)');
  assert.throws(
    () => core.openRuntimeState({ path }),
    rejected('UNSUPPORTED_DATABASE'),
  );
  assert.equal(db.prepare('PRAGMA application_id').get().application_id, 0);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 0);
});

test('transaction scopes expire before inspecting returned object getters', (t) => {
  const { state } = setup(t);
  assert.throws(
    () =>
      state.transaction((tx) => {
        tx.appendEvent(event);
        return {
          get then() {
            tx.appendEvent(event);
            return undefined;
          },
        };
      }),
    rejected('EXPIRED_TRANSACTION'),
  );
  assert.deepEqual(state.listEvents(), []);
});

test('a rejected async result is observed rather than terminating the control-plane process', (t) => {
  const path = location(t);
  const script = `
    import { openRuntimeState } from ${JSON.stringify(new URL('../packages/core/dist/index.js', import.meta.url).href)};
    const state = openRuntimeState({ path: ${JSON.stringify(path)} });
    try {
      state.transaction(tx => (async () => {
        await Promise.resolve();
        tx.appendEvent(${JSON.stringify(event)});
      })());
      throw new Error('async transaction unexpectedly accepted');
    } catch (error) { if (error.code !== 'INVALID_INPUT') throw error; }
    await new Promise(setImmediate);
    if (state.listEvents().length !== 0) throw new Error('partial transaction committed');
    state.close();
  `;
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { encoding: 'utf8', timeout: 5000 },
  );
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
});
