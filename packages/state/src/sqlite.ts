import { verifyDatabaseIntegrity } from './integrity.js';
import { types } from 'node:util';
import {
  closeSync,
  constants,
  lstatSync,
  openSync,
  realpathSync,
  unlinkSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { registerBackupControl } from './backup-integration.js';
import type {
  BackupRecord,
  BackupFreshness,
  BackupFreshnessPolicy,
} from './backup-types.js';
import {
  applyMigrations,
  inspectMigrations,
  migrations,
  verifySchema,
} from './migrations.js';
import {
  cursor,
  eventType,
  invalid,
  newId,
  outcome,
  record,
  timestamp,
  uuid,
} from './records.js';
import {
  RuntimeStateError,
  stateError,
  type InboxItem,
  type RuntimeEvent,
  type RuntimeRun,
  type RuntimeState,
  type RuntimeStateOptions,
  type RuntimeTransaction,
} from './types.js';

function databasePath(options: RuntimeStateOptions): string {
  const value = record(options, ['path'])['path'];
  if (
    typeof value !== 'string' ||
    !value ||
    !isAbsolute(value) ||
    value.includes('\0')
  ) {
    throw new RuntimeStateError(
      'INVALID_PATH',
      'Choose an explicit absolute runtime database file path.',
      'path',
    );
  }
  try {
    const path = join(realpathSync(dirname(value)), basename(value));
    try {
      closeSync(
        openSync(
          path,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
          0o600,
        ),
      );
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'EEXIST'
      ))
        throw error;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new RuntimeStateError(
          'INVALID_PATH',
          'Select a regular database file, not a directory or symlink.',
          'path',
        );
      }
    }
    return path;
  } catch (error) {
    throw stateError(error);
  }
}

const RUN_QUERY =
  'SELECT id, worker_id AS workerId, started_at AS startedAt, finished_at AS finishedAt, outcome FROM runs WHERE id = ?';
const INBOX_QUERY =
  'SELECT id, source_id AS sourceId, received_at AS receivedAt FROM inbox_items WHERE id = ?';
const EVENT_QUERY =
  'SELECT sequence, id, type, actor_id AS actorId, occurred_at AS occurredAt, run_id AS runId, inbox_item_id AS inboxItemId, backup_id AS backupId FROM events';

export function createSqliteRuntimeState(
  options: RuntimeStateOptions,
): RuntimeState {
  let path: string;
  try {
    path = databasePath(options);
  } catch (error) {
    throw stateError(error, 'INVALID_INPUT');
  }
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path, {
      timeout: 250,
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
    });
  } catch (error) {
    throw stateError(error);
  }
  try {
    inspectMigrations(db);
    if (
      db.prepare('PRAGMA journal_mode = WAL').get()?.['journal_mode'] !== 'wal'
    ) {
      throw new RuntimeStateError(
        'STATE_IO_ERROR',
        'The runtime database must support WAL mode on local storage.',
      );
    }
    db.exec(
      'PRAGMA foreign_keys=ON; PRAGMA recursive_triggers=ON; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF',
    );
    applyMigrations(db);
    verifySchema(db);
  } catch (error) {
    db.close();
    throw stateError(error);
  }

  let closed = false;
  let snapshotActive = false;
  interface Scope {
    live: boolean;
    failed: boolean;
  }
  let current: Scope | null = null;
  function idle(): void {
    if (closed)
      throw new RuntimeStateError(
        'STATE_CLOSED',
        'Runtime state is closed; open a new Core state instance.',
      );
    if (snapshotActive)
      throw new RuntimeStateError(
        'STATE_BUSY',
        'Wait for the active snapshot to finish.',
      );
    if (current) {
      current.failed = true;
      throw new RuntimeStateError(
        'TRANSACTION_ACTIVE',
        'Use the scoped transaction API; nested or outer-state operations are unsupported.',
      );
    }
  }
  function perform<T>(scope: Scope, work: () => T): T {
    if (!scope.live)
      throw new RuntimeStateError(
        'EXPIRED_TRANSACTION',
        'The transaction API is valid only during its synchronous callback.',
      );
    if (scope.failed)
      throw new RuntimeStateError(
        'TRANSACTION_FAILED',
        'This transaction has failed and must roll back.',
      );
    try {
      return work();
    } catch (error) {
      scope.failed = true;
      throw stateError(error);
    }
  }
  function getRun(id: string): RuntimeRun | null {
    const row = db.prepare(RUN_QUERY).get(uuid(id, 'id'));
    return row ? ({ ...row } as unknown as RuntimeRun) : null;
  }
  function getInboxItem(id: string): InboxItem | null {
    const row = db.prepare(INBOX_QUERY).get(uuid(id, 'id'));
    return row ? ({ ...row } as unknown as InboxItem) : null;
  }
  function appendEvent(input: unknown): RuntimeEvent {
    const value = record(input, [
      'id',
      'type',
      'actorId',
      'occurredAt',
      'runId',
      'inboxItemId',
      'backupId',
    ]);
    const id = newId(value['id']);
    const type = eventType(value['type']);
    const actorId = uuid(value['actorId'], 'actorId');
    const occurredAt = timestamp(value['occurredAt'], 'occurredAt');
    const runId =
      value['runId'] === undefined ? null : uuid(value['runId'], 'runId');
    const inboxItemId =
      value['inboxItemId'] === undefined
        ? null
        : uuid(value['inboxItemId'], 'inboxItemId');
    const backupId =
      value['backupId'] === undefined
        ? null
        : uuid(value['backupId'], 'backupId');
    db.prepare(
      'INSERT INTO events (id, type, actor_id, occurred_at, run_id, inbox_item_id, backup_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, type, actorId, occurredAt, runId, inboxItemId, backupId);
    return {
      ...db.prepare(`${EVENT_QUERY} WHERE id = ?`).get(id),
    } as unknown as RuntimeEvent;
  }
  function createInboxItem(input: unknown): InboxItem {
    const value = record(input, ['id', 'sourceId', 'actorId', 'receivedAt']);
    const id = newId(value['id']);
    const sourceId = uuid(value['sourceId'], 'sourceId');
    const actorId = uuid(value['actorId'], 'actorId');
    const receivedAt = timestamp(value['receivedAt'], 'receivedAt');
    db.prepare(
      'INSERT INTO inbox_items (id, source_id, received_at) VALUES (?, ?, ?)',
    ).run(id, sourceId, receivedAt);
    appendEvent({
      type: 'inbox.created',
      actorId,
      occurredAt: receivedAt,
      inboxItemId: id,
    });
    return { id, sourceId, receivedAt };
  }
  function startRun(input: unknown): RuntimeRun {
    const value = record(input, ['id', 'workerId', 'actorId', 'startedAt']);
    const id = newId(value['id']);
    const workerId = uuid(value['workerId'], 'workerId');
    const actorId = uuid(value['actorId'], 'actorId');
    const startedAt = timestamp(value['startedAt'], 'startedAt');
    db.prepare(
      'INSERT INTO runs (id, worker_id, started_at) VALUES (?, ?, ?)',
    ).run(id, workerId, startedAt);
    appendEvent({
      type: 'run.started',
      actorId,
      occurredAt: startedAt,
      runId: id,
    });
    return { id, workerId, startedAt, finishedAt: null, outcome: null };
  }
  function finishRun(input: unknown): RuntimeRun {
    const value = record(input, ['id', 'actorId', 'outcome', 'finishedAt']);
    const id = uuid(value['id'], 'id');
    const actorId = uuid(value['actorId'], 'actorId');
    const result = outcome(value['outcome']);
    const finishedAt = timestamp(value['finishedAt'], 'finishedAt');
    const run = getRun(id);
    if (!run)
      throw new RuntimeStateError(
        'RUN_NOT_FOUND',
        'Start the referenced run before finishing it.',
      );
    if (run.finishedAt !== null)
      throw new RuntimeStateError(
        'RUN_FINISHED',
        'A completed run cannot be finished again.',
      );
    if (finishedAt < run.startedAt) return invalid('finishedAt');
    db.prepare(
      'UPDATE runs SET finished_at = ?, outcome = ? WHERE id = ? AND finished_at IS NULL',
    ).run(finishedAt, result, id);
    appendEvent({
      type: 'run.finished',
      actorId,
      occurredAt: finishedAt,
      runId: id,
    });
    return { ...run, finishedAt, outcome: result };
  }
  function listEvents(input: unknown = {}): RuntimeEvent[] {
    const { afterSequence, limit } = cursor(input);
    return db
      .prepare(`${EVENT_QUERY} WHERE sequence > ? ORDER BY sequence LIMIT ?`)
      .all(afterSequence, limit)
      .map((row) => ({ ...row }) as unknown as RuntimeEvent);
  }
  function scoped(scope: Scope): RuntimeTransaction {
    return Object.freeze({
      appendEvent: (input) => perform(scope, () => appendEvent(input)),
      createInboxItem: (input) => perform(scope, () => createInboxItem(input)),
      startRun: (input) => perform(scope, () => startRun(input)),
      finishRun: (input) => perform(scope, () => finishRun(input)),
      getRun: (id) => perform(scope, () => getRun(id)),
      getInboxItem: (id) => perform(scope, () => getInboxItem(id)),
      listEvents: (input) => perform(scope, () => listEvents(input)),
    } satisfies RuntimeTransaction);
  }
  function transaction<T>(work: (tx: RuntimeTransaction) => T): T {
    idle();
    try {
      if (
        typeof work !== 'function' ||
        work.constructor.name === 'AsyncFunction'
      )
        return invalid();
    } catch (error) {
      throw stateError(error, 'INVALID_INPUT');
    }
    try {
      db.exec('BEGIN IMMEDIATE');
    } catch (error) {
      throw stateError(error);
    }
    const scope: Scope = { live: true, failed: false };
    current = scope;
    try {
      const result = work(scoped(scope));
      // No operation may use this scope after the callback itself has returned.
      scope.live = false;
      if (types.isPromise(result)) {
        // Observe rejected unsupported async work without invoking its .then getter.
        void Promise.prototype.then.call(result, undefined, () => undefined);
        return invalid();
      }
      if (
        result !== null &&
        (typeof result === 'object' || typeof result === 'function') &&
        'then' in result &&
        typeof result.then === 'function'
      )
        return invalid();
      if (scope.failed)
        throw new RuntimeStateError(
          'TRANSACTION_FAILED',
          'A failed operation invalidated the entire transaction.',
        );
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        closed = true;
        db.close();
      }
      throw stateError(error, 'TRANSACTION_FAILED');
    } finally {
      scope.live = false;
      current = null;
    }
  }
  function query<T>(work: () => T): T {
    idle();
    try {
      return work();
    } catch (error) {
      throw stateError(error);
    }
  }
  function getBackup(id: string): BackupRecord | null {
    const row = db
      .prepare(
        'SELECT id, destination_id AS destinationId, actor_id AS actorId, started_at AS startedAt, finished_at AS finishedAt, outcome, encrypted_ack FROM backups WHERE id = ?',
      )
      .get(uuid(id, 'id'));
    if (!row) return null;
    const { encrypted_ack, ...fields } = row;
    return {
      ...fields,
      encryptionAcknowledged: encrypted_ack === 1 ? true : null,
    } as unknown as BackupRecord;
  }
  function freshness(input: BackupFreshnessPolicy = {}): BackupFreshness {
    const values = record(input, ['now', 'maxAgeMs']);
    const now = Date.parse(timestamp(values['now'], 'now'));
    const maxAge = values['maxAgeMs'] ?? 86400000;
    if (
      typeof maxAge !== 'number' ||
      !Number.isSafeInteger(maxAge) ||
      maxAge <= 0
    )
      return invalid('maxAgeMs');
    const last = db
      .prepare(
        "SELECT started_at, finished_at FROM backups WHERE outcome = 'succeeded' ORDER BY started_at DESC, rowid DESC LIMIT 1",
      )
      .get();
    const attempt = db
      .prepare('SELECT id FROM backups ORDER BY rowid DESC LIMIT 1')
      .get();
    const latestAttempt = attempt ? getBackup(String(attempt['id'])) : null;
    if (!last)
      return {
        status: 'never',
        lastSuccessAt: null,
        lastSnapshotStartedAt: null,
        ageMs: null,
        latestAttempt,
      };
    const lastSuccessAt = String(last['finished_at']);
    const lastSnapshotStartedAt = String(last['started_at']);
    const ageMs = now - Date.parse(lastSnapshotStartedAt);
    if (!Number.isFinite(ageMs))
      throw new RuntimeStateError(
        'STATE_CORRUPT',
        'Invalid stored backup timestamp.',
      );
    return {
      status: ageMs < 0 ? 'clock-skew' : ageMs <= maxAge ? 'fresh' : 'stale',
      lastSuccessAt,
      lastSnapshotStartedAt,
      ageMs: ageMs < 0 ? null : ageMs,
      latestAttempt,
    };
  }
  const runtime = Object.freeze({
    getBackup: (id) => query(() => getBackup(id)),
    getBackupFreshness: (policy) => query(() => freshness(policy)),
    verifyIntegrity: () =>
      query(() => {
        verifyDatabaseIntegrity(db);
        return { ok: true as const };
      }),
    appendEvent: (input) => transaction((tx) => tx.appendEvent(input)),
    createInboxItem: (input) => transaction((tx) => tx.createInboxItem(input)),
    startRun: (input) => transaction((tx) => tx.startRun(input)),
    finishRun: (input) => transaction((tx) => tx.finishRun(input)),
    getRun: (id) => query(() => getRun(id)),
    getInboxItem: (id) => query(() => getInboxItem(id)),
    listEvents: (input) => query(() => listEvents(input)),
    transaction,
    getStatus: () =>
      query(() => {
        const version = inspectMigrations(db);
        const journalMode = db.prepare('PRAGMA journal_mode').get()?.[
          'journal_mode'
        ];
        const foreignKeys = db.prepare('PRAGMA foreign_keys').get()?.[
          'foreign_keys'
        ];
        if (
          version !== migrations.length ||
          journalMode !== 'wal' ||
          foreignKeys !== 1
        )
          throw new RuntimeStateError(
            'SCHEMA_MISMATCH',
            'Runtime state settings differ from the required schema, WAL, or foreign-key configuration.',
          );
        return {
          schemaVersion: version,
          journalMode: 'wal',
          foreignKeys: true,
        };
      }),
    close: () => {
      if (closed) return;
      idle();
      try {
        db.close();
        closed = true;
      } catch (error) {
        throw stateError(error);
      }
    },
  } satisfies RuntimeState);
  registerBackupControl(runtime, {
    begin: (input) =>
      transaction(() => {
        const value = record(input, [
          'id',
          'destinationId',
          'actorId',
          'startedAt',
        ]);
        const id = uuid(value['id'], 'id');
        const destinationId = uuid(value['destinationId'], 'destinationId');
        const actorId = uuid(value['actorId'], 'actorId');
        const startedAt = timestamp(value['startedAt'], 'startedAt');
        db.prepare(
          'INSERT INTO backups (id, destination_id, actor_id, started_at) VALUES (?, ?, ?, ?)',
        ).run(id, destinationId, actorId, startedAt);
        return getBackup(id)!;
      }),
    finish: (input) =>
      transaction(() => {
        const value = record(input, ['id', 'outcome', 'finishedAt']);
        const id = uuid(value['id'], 'id');
        const result = value['outcome'];
        if (result !== 'succeeded' && result !== 'failed')
          return invalid('outcome');
        const finishedAt = timestamp(value['finishedAt'], 'finishedAt');
        const existing = getBackup(id);
        if (
          !existing ||
          existing.outcome !== null ||
          finishedAt < existing.startedAt
        )
          return invalid('id');
        db.prepare(
          'UPDATE backups SET finished_at = ?, outcome = ?, encrypted_ack = ? WHERE id = ?',
        ).run(finishedAt, result, result === 'succeeded' ? 1 : null, id);
        appendEvent({
          type: result === 'succeeded' ? 'backup.completed' : 'backup.failed',
          actorId: existing.actorId,
          occurredAt: finishedAt,
          backupId: id,
        });
        return getBackup(id)!;
      }),
    snapshot: async (destination) => {
      idle();
      if (
        typeof destination !== 'string' ||
        !isAbsolute(destination) ||
        destination.includes('\0')
      )
        throw new RuntimeStateError(
          'INVALID_PATH',
          'Choose a new absolute snapshot file.',
        );
      let identity: { ino: number; dev: number };
      try {
        const fd = openSync(
          destination,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
          0o600,
        );
        closeSync(fd);
        identity = lstatSync(destination);
      } catch {
        throw new RuntimeStateError(
          'INVALID_PATH',
          'Snapshot destination must be a new file in an accessible directory.',
        );
      }
      snapshotActive = true;
      try {
        await sqliteBackup(db, destination);
        const snapshot = new DatabaseSync(destination, {
          readOnly: true,
          enableForeignKeyConstraints: true,
        });
        try {
          verifyDatabaseIntegrity(snapshot);
        } finally {
          snapshot.close();
        }
      } catch (error) {
        try {
          const info = lstatSync(destination);
          if (info.ino === identity.ino && info.dev === identity.dev)
            unlinkSync(destination);
        } catch {
          /* Core also cleans its owned operation directory. */
        }
        throw stateError(error);
      } finally {
        snapshotActive = false;
      }
    },
  });
  return runtime;
}
