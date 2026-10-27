import { readRuntimeDatabase } from './inspection.js';
import { backupFreshness } from './backups.js';
import {
  getStewardInteraction,
  getStewardDecision,
  stewardScope,
} from './steward.js';
import type {
  StewardScope,
  StewardInteraction,
  StewardDecision,
} from './steward-types.js';
import type { BackupFreshness } from './backup-types.js';
import { invalid, record } from './records.js';
import { stateError } from './types.js';
export interface StewardSnapshotOptions {
  path: string;
  scope?: StewardScope;
  limit?: number;
}
export interface StewardSnapshot {
  schemaVersion: number;
  scope: StewardScope | null;
  inbox: { total: number; triaged: number };
  runs: {
    total: number;
    pending: number;
    succeeded: number;
    failed: number;
    cancelled: number;
  };
  interactions: { total: number };
  decisions: { total: number };
  recentInteractions: StewardInteraction[];
  recentDecisions: StewardDecision[];
  backup: Pick<BackupFreshness, 'status' | 'ageMs' | 'lastSuccessAt'>;
}
export function readSqliteStewardSnapshot(
  options: StewardSnapshotOptions,
): StewardSnapshot {
  try {
    const values = record(options, ['path', 'scope', 'limit']);
    const scope =
      values['scope'] === undefined ? null : stewardScope(values['scope']);
    const limit = values['limit'] === undefined ? 10 : values['limit'];
    if (
      typeof limit !== 'number' ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 32
    )
      return invalid('limit');
    return readRuntimeDatabase(values['path'], (db, version) => {
      const inbox = db
        .prepare(
          "WITH scoped AS (SELECT COALESCE((SELECT c.scope FROM inbox_triage_changes c WHERE c.inbox_item_id=b.id ORDER BY revision DESC LIMIT 1),m.scope,'unclassified') AS scope,COALESCE((SELECT c.triaged FROM inbox_triage_changes c WHERE c.inbox_item_id=b.id ORDER BY revision DESC LIMIT 1),0) AS triaged FROM inbox_items b LEFT JOIN inbox_intake m ON m.inbox_item_id=b.id) SELECT count(*) AS total,COALESCE(sum(triaged),0) AS triaged FROM scoped WHERE ? IS NULL OR scope = ?",
        )
        .get(scope, scope)!;
      const runs = db
        .prepare(
          "SELECT count(*) AS total,COALESCE(sum(r.outcome IS NULL),0) AS pending,COALESCE(sum(r.outcome='succeeded'),0) AS succeeded,COALESCE(sum(r.outcome='failed'),0) AS failed,COALESCE(sum(r.outcome='cancelled'),0) AS cancelled FROM runs r LEFT JOIN steward_interactions i ON i.run_id=r.id WHERE ? IS NULL OR i.scope = ?",
        )
        .get(scope, scope)!;
      const interactions = db
        .prepare(
          'SELECT count(*) AS total FROM steward_interactions WHERE ? IS NULL OR scope = ?',
        )
        .get(scope, scope)!;
      const decisions = db
        .prepare(
          'SELECT count(*) AS total FROM steward_decisions d JOIN steward_interactions i ON i.id=d.interaction_id WHERE ? IS NULL OR i.scope = ?',
        )
        .get(scope, scope)!;
      const recentInteractions = db
        .prepare(
          'SELECT id FROM steward_interactions WHERE ? IS NULL OR scope = ? ORDER BY sequence DESC LIMIT ?',
        )
        .all(scope, scope, limit)
        .map((row) => getStewardInteraction(db, String(row['id']))!);
      const recentDecisions = db
        .prepare(
          'SELECT d.id FROM steward_decisions d JOIN steward_interactions i ON i.id=d.interaction_id WHERE ? IS NULL OR i.scope = ? ORDER BY d.sequence DESC LIMIT ?',
        )
        .all(scope, scope, limit)
        .map((row) => getStewardDecision(db, String(row['id']))!);
      const backup = backupFreshness(db);
      return {
        schemaVersion: version,
        scope,
        inbox: { ...inbox } as unknown as StewardSnapshot['inbox'],
        runs: { ...runs } as unknown as StewardSnapshot['runs'],
        interactions: {
          ...interactions,
        } as unknown as StewardSnapshot['interactions'],
        decisions: { ...decisions } as unknown as StewardSnapshot['decisions'],
        recentInteractions,
        recentDecisions,
        backup: {
          status: backup.status,
          ageMs: backup.ageMs,
          lastSuccessAt: backup.lastSuccessAt,
        },
      };
    });
  } catch (error) {
    throw stateError(error);
  }
}
