# FR-005 Backup and restore contract

## Scope and approach

Implement MZ-005: safe SQLite snapshots, an external encrypted-backup hook, durable backup attempts/results and freshness, plus fixture restoration and an operational restore procedure. The active goal authorizes implementing tickets in order. No actual off-host destination, production key, schedule, or restore is provisioned. Those live requirements must be documented separately from fixture evidence.

Use Node's SQLite online backup API instead of copying a live database/WAL file. Core orchestrates a trusted external encryption/storage hook; it does not implement a proprietary backup format or secret manager. A test hook performs real authenticated encryption/decryption of synthetic SQLite snapshots solely to verify the contract and fixture restoration. Production hooks should delegate to established encrypted backup tools/services and acknowledge only after durable encrypted storage succeeds.

## Schema migration 002

Keep migration 001 immutable. Migration 002 creates `backups` with UUID id/destination/actor references, start/finish UTC timestamps, pending/succeeded/failed outcome, and encrypted acknowledgement (1 only for success, null otherwise). Add nullable `events.backup_id` referencing backups. Existing history remains append-only; existing rows have null backup references. Verify actual version-1 fixture upgrade and rollback tests.

Backup identity is also the artifact's lookup/tag identity. Hook implementations must be able to retrieve the encrypted snapshot by this UUID; provider-specific paths, URLs, credentials, raw error messages, or receipts do not enter SQLite. Result events are backup.completed/backup.failed and share the terminal update transaction. A pending attempt is persisted before snapshot/hook work; interrupted attempts cannot look successful.

Add read-only `getBackup(id)`, `getBackupFreshness({now?,maxAgeMs?})`, and `verifyIntegrity()` to Core state. Freshness reports never/fresh/stale/clock-skew, last success time/age, and latest attempt. Default max age is 24 hours. Age uses the successful snapshot with the newest attempt start, conservatively measuring data age from that start; completion time remains separately visible. Older snapshots completing late cannot refresh data age. A later failed/pending attempt remains visible even when an older success is within policy. Integrity verification uses SQLite integrity_check, foreign_key_check, and migration/schema checks through Core.

## Snapshot boundary

The SQLite connection remains private. State integration helpers hold a private association from the typed state instance to its snapshot/backup-record functions; no raw SQL or snapshot-path method is added to worker record transactions. Core's public backup orchestration is the control-plane interface.

A native snapshot targets a new exclusive 0600 file in a Core-created 0700 operation directory. Never overwrite an existing file, source database, symlink, or hardlink. While native backup is active, typed operations/close fail safely with STATE_BUSY; external SQLite connections may still write and the native backup API maintains consistency. Failed owned artifacts are cleaned up. No database handle is exposed.

Core requires an explicitly configured private staging directory, checked with the same trusted-host filesystem rules as secret storage. Factor those checks into a shared internal Core helper now that there are two concrete consumers. The trusted hook receives only the operation's private snapshot path, UUID, and schema version.

## Hook and orchestration contract

`backupRuntimeState({state, stagingDirectory, destinationId, actorId, hook}): Promise<BackupRecord>`:

1. Validate structural options and known state before side effects.
2. Persist a pending attempt with generated UUID and current UTC timestamp.
3. Create a private operation directory and use SQLite online backup into it.
4. Call `hook.store({backupId, snapshotPath, schemaVersion})`.
5. Require an own-data-property receipt exactly `{backupId, encrypted: true}` with matching identity. This is the trusted hook's acknowledgement, not independent proof of remote topology/encryption.
6. Remove the operation directory/plaintext snapshot, then atomically record success and its event.
7. On snapshot/hook/receipt/cleanup failure, record failure and its event when state is available, clean owned artifacts, and throw a safe BackupError. If final auditing cannot persist (e.g. the caller closed state while the external hook ran), throw BACKUP_AUDIT_FAILED rather than claim success; the durable pending marker remains.

The hook must settle only after encryption and durable external storage. It must not return keys, plaintext, vendor credentials, or raw errors. Credential use can occur inside the host's scoped SecretHandle action. A hook can be implemented incorrectly or lie; production validation/off-host assurance is an operator responsibility, not inferred from a boolean or a local fixture.

Native snapshots are taken after the pending marker but before the completion acknowledgement. A restored image therefore has that attempt pending and lacks its later completion event; it still contains all earlier committed application data/history. The restore runbook must explain this causal boundary and reconcile against the external receipt.

## Restoration and deployment evidence

Fixture tests encrypt a real snapshot outside the operation directory, delete/close the original source, authenticate/decrypt into a new private file, open through Core, verify integrity, and compare actual run/inbox/event data. Also test wrong/corrupted encrypted fixture rejection and failed hooks/receipts/audits, staging cleanup, freshness states, migration preservation, and snapshot lifecycle/contending connections.

Document live setup separately: control-plane storage outside disposable workers, encrypted off-host destination and scoped credentials, automatic scheduling, age policy/monitoring, 14 daily/8 weekly retention starting point, independent periodic restore, plaintext-stage cleanup and interrupted-attempt reconciliation. Do not claim any of these deployments happened during tests. Actual production restore is an operational action requiring appropriate human authorization.
