# Backup and restore

FR-005 provides a native SQLite snapshot, a trusted external encrypted-storage hook, durable audit records, and a verified synthetic restore. It provisions no production destination, encryption key, schedule, or off-host copy.

## Control-plane contract

Import `backupRuntimeState` from `@mz/core`. Supply an open Core state instance, an absolute private `stagingDirectory`, stable UUID `destinationId` and `actorId`, and a trusted `hook` with `store(snapshot)`. The host staging directory must already exist, be owned by the effective user or root, have mode 0700, and satisfy the same ancestor rules as [secret storage](secrets.md). Use persistent control-plane storage outside disposable workers.

```js
import { backupRuntimeState } from '@mz/core';

const result = await backupRuntimeState({
  state,
  stagingDirectory: '/absolute/control-plane/backup-stage',
  destinationId, // Configured stable UUID; no address or credentials.
  actorId,
  hook: encryptedStorageHook, // Trusted host integration, configured separately.
});
```

The hook receives a frozen `{backupId, snapshotPath, schemaVersion}`. It must encrypt the snapshot using an established backup tool/service, durably store it outside the operation directory under the backup UUID, then return exactly `{backupId, encrypted: true}`. Do not acknowledge merely queuing an upload. Resolve credentials inside a scoped SecretHandle action; never include credentials, source content, provider errors, URLs, or provider receipts in the return value. The hook owns transport cancellation/timeouts and authenticated retrieval. Core does not supply an encryption format, transport, or production hook. The acknowledgement is a trusted integration contract, not independent proof of encryption or off-host placement.

Core records a pending attempt before asynchronous work. SQLite's online backup API creates an exclusive 0600 snapshot in a new 0700 operation directory, including committed WAL data without copying live database files. Migration/schema, integrity, and foreign-key checks run on the snapshot before the hook. Core state operations and close reject with `STATE_BUSY` during native copying; they are available while the external hook runs. Other connections may write; the native snapshot remains consistent.

After an exact matching encrypted receipt and plaintext cleanup, Core atomically records success and a `backup.completed` event referencing the backup. Snapshot, hook, receipt, or cleanup failures produce a failed attempt and `backup.failed` when auditing is available. `BackupError` exposes a static safe code/message and optional backup UUID, without original causes or provider messages. `BACKUP_AUDIT_FAILED` means the outcome could not be safely finalized; inspect the durable row and external storage rather than assuming success. Interrupted processes can leave pending rows and private staging files. Do not automatically delete files belonging to a still-running attempt.

## Health and history

`state.getBackup(id)` returns the detached pending or terminal record. `state.getBackupFreshness({now?, maxAgeMs?})` defaults to the current UTC time and a 24-hour maximum age. It returns `never`, `fresh`, `stale`, or `clock-skew`, plus the latest attempt and the successful snapshot with the newest start time. `lastSuccessAt` is that snapshot's completion time; `lastSnapshotStartedAt` is its attempt start. `ageMs` measures time since the start, a conservative bound on data age. Slow uploads or late completion of older snapshots cannot refresh old data. Failed/pending attempts never establish freshness. A later failure is visible even when an earlier successful snapshot remains fresh. Negative age is `clock-skew` with null age; investigate host time.

This is durable local metadata, not a remote inventory check. Monitor missing/stale backups and failed/pending attempts separately. A restored database contains its own backup attempt as pending: the snapshot precedes upload acknowledgement and the later completion event. Reconcile that marker against the external artifact and receipt; do not rewrite append-only history or infer that restoration failed from this expected marker.

## Restore procedure

1. Identify the company/runtime instance, intended recovery point, backup UUID, release/schema version, encrypted artifact, and corresponding external storage evidence. Obtain authorization for a production restore. Preserve the existing database and its WAL/SHM files together before replacing anything; stop all writers and scheduled backups during the cutover.
2. On a trusted recovery host, create a private 0700 recovery directory outside worker storage. Retrieve the encrypted artifact through the configured tool. Authenticate and decrypt using that tool into a **new** 0600 database file. Never overwrite the current database or copy only the main file of a live WAL database. Reject failed authentication; securely handle/delete any partial output according to the tool's documented behavior.
3. Use the matching release and `openRuntimeState({path: recoveredPath})` from Core. Opening applies supported forward migrations, so retain an untouched recovery copy first. Unknown future schemas or modified histories must fail; do not alter the ledger or force a downgrade. Call `state.verifyIntegrity()`; it must return `{ok: true}` after schema/migration, SQLite integrity, and foreign-key checks.
4. Validate expected application evidence: run outcomes, inbox/source identities and event sequences against independently recorded checkpoints. The encrypted fixture test compares actual run, inbox and event records after deleting the original database. For production, use the organization's recovery checkpoints and ensure referenced private repositories/source stores are also available. Expect the snapshot's own pending attempt, as described above.
5. Close the validation state. For an authorized cutover, move the validated database into the configured persistent runtime location while all writers are stopped; do not mix old WAL/SHM files with the restored main file. Preserve private ownership/permissions. Start one control plane, verify state and application behavior, then resume workers and backups. Record the recovery point, verification evidence and any lost interval in the organization's private operational record.
6. Remove owned plaintext recovery/staging artifacts after verification and according to host storage policy. Investigate `BACKUP_CLEANUP_FAILED`, abandoned pending attempts and leftover `mz-backup-*` directories. Coordinate with running jobs before cleanup; a deleted pathname is not a claim of physical media erasure.

## Live deployment prerequisites

The fixture acceptance is separate from deployment. Before relying on production recovery, configure and verify:

- Persistent runtime and private staging storage outside disposable workers, plus a tested hook using authenticated encryption and scoped symbolic secret references.
- A genuinely off-host destination and independent inventory/retrieval checks under the backup UUID. Demonstrate recovery when the original host/storage is unavailable.
- An automatic host/control-plane schedule, overlap prevention, bounded transport runtime, failure alerts, freshness policy and clock monitoring. No scheduler is implemented by FR-005.
- Retention appropriate to the organization; the implementation plan starts with 14 daily and 8 weekly backups. Retain required decrypting keys independently and test rotation/recovery access.
- Periodic independent restore drills, recorded recovery time/data loss, and recovery for the private company repository and external source stores as well as SQLite. FR-008 raw intake files are an explicit private source store; SQLite-only backups contain references/metadata, not their Markdown or private manifests.

## Verification boundary

`tests/backups.test.mjs` uses synthetic data and a local AES-256-GCM fixture hook, authenticates/decrypts a real native snapshot, deletes the original database, and restores through Core. It checks actual data/history, corruption rejection, v1 migration, WAL transaction consistency, receipt/audit failure handling, pending markers, staging cleanup, lifecycle and freshness. This test hook is not a supported production archive format. No real credentials, remote upload, schedule, retention policy, or production restore were exercised.
