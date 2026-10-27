import { lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupFreshness } from './backups.js';
import type { BackupFreshness, BackupFreshnessPolicy } from './backup-types.js';
import { verifyDatabaseIntegrity } from './integrity.js';
import { inspectMigrations, migrations } from './migrations.js';
import { record } from './records.js';
import { RuntimeStateError, stateError } from './types.js';
export interface RuntimeInspectionOptions extends BackupFreshnessPolicy {
  path: string;
}
export interface RuntimeInspection {
  schemaVersion: number;
  journalMode: 'wal';
  integrity: 'ok';
  backupFreshness: BackupFreshness;
}
/** Internal shared read transaction. The callback/connection is never exported through Core. */
export function readRuntimeDatabase<T>(
  path: unknown,
  work: (db: DatabaseSync, version: number) => T,
): T {
  let db: DatabaseSync | undefined;
  try {
    if (
      typeof path !== 'string' ||
      !isAbsolute(path) ||
      path.includes('\0') ||
      !lstatSync(path).isFile()
    )
      throw new RuntimeStateError(
        'INVALID_PATH',
        'Select an existing regular absolute database file.',
      );
    db = new DatabaseSync(path, {
      readOnly: true,
      timeout: 250,
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
    });
    db.exec('PRAGMA trusted_schema=OFF');
    db.exec('BEGIN');
    const version = inspectMigrations(db);
    if (version !== migrations.length)
      throw new RuntimeStateError(
        'SCHEMA_MISMATCH',
        'Use the current schema; read-only checks never initialize or upgrade runtime state.',
      );
    verifyDatabaseIntegrity(db);
    if (db.prepare('PRAGMA journal_mode').get()?.['journal_mode'] !== 'wal')
      throw new RuntimeStateError(
        'STATE_IO_ERROR',
        'Configure WAL mode through control-plane initialization.',
      );
    return work(db, version);
  } catch (error) {
    throw stateError(error);
  } finally {
    db?.close();
  }
}
export function inspectSqliteRuntimeState(
  options: RuntimeInspectionOptions,
): RuntimeInspection {
  try {
    const values = record(options, ['path', 'now', 'maxAgeMs']);
    return readRuntimeDatabase(values['path'], (db, version) => {
      const policy: BackupFreshnessPolicy = {};
      if (Object.hasOwn(values, 'now')) policy.now = values['now'] as string;
      if (Object.hasOwn(values, 'maxAgeMs'))
        policy.maxAgeMs = values['maxAgeMs'] as number;
      return {
        schemaVersion: version,
        journalMode: 'wal',
        integrity: 'ok',
        backupFreshness: backupFreshness(db, policy),
      };
    });
  } catch (error) {
    throw stateError(error);
  }
}
