import type { DatabaseSync } from 'node:sqlite';
import type {
  BackupRecord,
  BackupFreshness,
  BackupFreshnessPolicy,
} from './backup-types.js';
import { record, timestamp, uuid, invalid } from './records.js';
import { RuntimeStateError } from './types.js';
export function getBackupRecord(
  db: DatabaseSync,
  id: string,
): BackupRecord | null {
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
export function backupFreshness(
  db: DatabaseSync,
  input: BackupFreshnessPolicy = {},
): BackupFreshness {
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
  const latestAttempt = attempt
    ? getBackupRecord(db, String(attempt['id']))
    : null;
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
