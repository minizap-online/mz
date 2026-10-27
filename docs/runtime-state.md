# Runtime state through Core

FR-003 provides an embedded control-plane boundary for SQLite state. Worker/application code imports `openRuntimeState` and its types from `@mz/core`. The `@mz/state` package is the integration adapter; workers should not import it or open runtime files themselves. Core returns typed operations, without a connection, SQL executor, or query builder.

This is not a new network service, authentication system, capability grant, or production deployment. The control plane must initialize and scope state access; later capability enforcement remains required. Store actual runtime data outside disposable worker environments. This ticket provisions no real company database.

## Open and close

Requires Node.js 24+ with its built-in `node:sqlite` module. No native npm addon is required.

```js
import { randomUUID } from 'node:crypto';
import { openRuntimeState } from '@mz/core';

// The parent directory must already exist; there is no implicit worker-local path.
const state = openRuntimeState({
  path: '/absolute/control-plane/state.sqlite3',
});
const actorId = randomUUID(); // Example only: supply the assigned actor's stable ID.
const workerId = randomUUID();
const run = state.startRun({ actorId, workerId });
state.finishRun({ id: run.id, actorId, outcome: 'succeeded' });
const events = state.listEvents({ afterSequence: 0, limit: 100 });
state.close();
```

The path must be absolute and its parent accessible. In-memory paths, database-file symlinks, and nonregular files are rejected; a new file uses mode 0600. Existing file permissions are preserved, so the control-plane operator remains responsible for them and the parent directory. No path is inferred from company config. `close()` is idempotent; other methods reject use after close.

The adapter verifies WAL rather than silently falling back to another journal mode. Foreign keys, recursive triggers, FULL synchronous durability, and a bounded 250 ms writer timeout apply. `getStatus()` reports the schema version, WAL, and foreign-key state. It is not a backup health check. Use local SQLite-compatible storage; backup and restore requirements remain FR-005.

## Structural records only

The initial API stores identifiers, timestamps, enumerated event types, and run outcomes. It rejects extra fields, getters, inherited objects, arbitrary serialized payloads, raw text, and invalid scalar values before SQL writes. Record/actor/worker/source references must be canonical lowercase UUIDs with a standard version and variant; timestamps are canonical ISO UTC with milliseconds, such as `2026-10-27T12:00:00.000Z`. Record IDs and timestamps can be omitted to generate them; actor/worker/source identities must be supplied by the trusted control plane.

IDs are identifiers, never credential values. The API is intentionally unable to store arbitrary event payloads or source content. This does not claim to identify every credential a caller might deliberately mislabel as a valid identifier. Secret references, resolution, and redaction belong to FR-004; do not extend this schema with arbitrary content before defining their handling.

| Operation                | Input and result                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `appendEvent`            | `{id?, type, actorId, occurredAt?, runId?, inboxItemId?}` → event with increasing sequence                 |
| `createInboxItem`        | `{id?, sourceId, actorId, receivedAt?}` → immutable source-reference record and atomic inbox.created event |
| `startRun`               | `{id?, workerId, actorId, startedAt?}` → run and atomic run.started event                                  |
| `finishRun`              | `{id, actorId, outcome, finishedAt?}` → terminal run and atomic run.finished event                         |
| `getInboxItem`, `getRun` | UUID → detached record or null                                                                             |
| `listEvents`             | `{afterSequence?, limit?}` → ordered cursor page; defaults 0/100, limit 1–1000                             |

A run finishes once with `succeeded`, `failed`, or `cancelled`, no earlier than its start. Changing returned objects does not change stored data. Event order follows append sequence rather than occurrence timestamp. Duplicate IDs fail; they never replace history. Event entity references must already exist. The fixed `RUNTIME_EVENT_TYPES` vocabulary includes the implementation design's initial types plus run.started/run.finished; changing the stored enum requires a migration.

No API deletes events/inbox records, rewrites an event, or exposes editable task planning. GitHub Issues/Projects remain authoritative for work status, priority, and milestones. The inbox schema records private source identity only; it does not implement ingest, triage, source retention, or publication.

## Transactions

```js
state.transaction((tx) => {
  const item = tx.createInboxItem({ sourceId: randomUUID(), actorId });
  const run = tx.startRun({ workerId, actorId });
  tx.appendEvent({
    type: 'decision.recorded',
    actorId,
    runId: run.id,
    inboxItemId: item.id,
  });
});
```

The callback receives the record/query methods, without transaction, close, or status. Every call in the batch and its automatic audit events commits together. Any exception rolls back the batch; catching a failed operation inside the callback still invalidates the entire transaction. A failed operation leaves no partial entity/event pair.

Callbacks must be synchronous. Async functions and returned thenables fail; transaction scopes expire at callback completion. Nested transactions, outer-state calls, and close during a transaction fail. Do not schedule background work from a transaction callback. Rejected native Promise results are observed to avoid unhandled rejections, but the adapter cannot cancel already scheduled asynchronous work. Reads on another WAL connection see only committed data. A competing writer fails with `STATE_BUSY` after the bounded timeout; retry the whole operation after the writer finishes.

## Schema and errors

See [schema v1 and migration rules](../schemas/runtime-state-v1.md). Reopening is idempotent. Foreign databases, unsupported future versions, modified checksums, and altered schema objects fail rather than being treated as an empty database. There is no automatic migration repair or downgrade.

`RuntimeStateError` provides a stable code and optional known field name. Boundary errors never retain raw SQL, driver messages, callback messages/causes, or offending values. Catch and report the safe error rather than logging the rejected input.

| Code                                        | Meaning                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `INVALID_INPUT`, `INVALID_PATH`             | Correct the structural fields, identifier/time format, or explicit database location. |
| `STATE_CLOSED`                              | Open a new Core state instance.                                                       |
| `STATE_BUSY`                                | Retry after the active writer finishes.                                               |
| `STATE_CONFLICT`                            | Duplicate identity or invalid entity reference; no partial change is committed.       |
| `STATE_IO_ERROR`                            | Check storage path, permissions, and WAL support.                                     |
| `UNSUPPORTED_DATABASE`, `SCHEMA_MISMATCH`   | Use a matching recognized database/release; do not overwrite it.                      |
| `MIGRATION_FAILED`                          | Migration rolled back; inspect the release and migration instructions.                |
| `TRANSACTION_ACTIVE`, `EXPIRED_TRANSACTION` | Use only the live scoped transaction interface.                                       |
| `TRANSACTION_FAILED`                        | The batch rolled back, including after a caught operation failure.                    |
| `RUN_NOT_FOUND`, `RUN_FINISHED`             | Start the run first or avoid finishing a terminal run again.                          |

Tests create temporary synthetic databases. They verify migrations/rollback, schema integrity, append-only triggers, audit atomicity, cursor order, state lifecycle, contention, rejected-content absence, and clean installation. No real organization state, secret provider, remote backup, or restore was exercised.
