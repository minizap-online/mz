export interface BackupRecord {
  id: string;
  destinationId: string;
  actorId: string;
  startedAt: string;
  finishedAt: string | null;
  outcome: 'succeeded' | 'failed' | null;
  encryptionAcknowledged: true | null;
}
export interface BackupFreshnessPolicy {
  now?: string;
  maxAgeMs?: number;
}
export interface BackupFreshness {
  status: 'never' | 'fresh' | 'stale' | 'clock-skew';
  lastSuccessAt: string | null;
  lastSnapshotStartedAt: string | null;
  ageMs: number | null;
  latestAttempt: BackupRecord | null;
}
export interface BeginBackup {
  id: string;
  destinationId: string;
  actorId: string;
  startedAt?: string;
}
export interface FinishBackup {
  id: string;
  outcome: 'succeeded' | 'failed';
  finishedAt?: string;
}
