import type { DatabaseSync } from 'node:sqlite';
import { inspectMigrations, verifySchema } from './migrations.js';
import { RuntimeStateError } from './types.js';

export function verifyDatabaseIntegrity(db: DatabaseSync): void {
  inspectMigrations(db);
  verifySchema(db);
  const rows = db.prepare('PRAGMA integrity_check').all();
  if (
    rows.length !== 1 ||
    rows[0]?.['integrity_check'] !== 'ok' ||
    db.prepare('PRAGMA foreign_key_check').all().length
  ) {
    throw new RuntimeStateError(
      'STATE_CORRUPT',
      'Runtime state failed integrity checks.',
    );
  }
}
