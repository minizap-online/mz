import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { RuntimeStateError, stateError } from './types.js';

export const APPLICATION_ID = 0x4d5a5354;
export interface Migration {
  version: number;
  name: string;
  sql: string;
}
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_runtime_state',
    sql: readFileSync(
      new URL('../migrations/001-runtime.sql', import.meta.url),
      'utf8',
    ),
  },
  {
    version: 2,
    name: 'backup_history',
    sql: readFileSync(
      new URL('../migrations/002-backups.sql', import.meta.url),
      'utf8',
    ),
  },
  {
    version: 3,
    name: 'private_intake_metadata',
    sql: readFileSync(
      new URL('../migrations/003-intake.sql', import.meta.url),
      'utf8',
    ),
  },
  {
    version: 4,
    name: 'append_only_inbox_triage',
    sql: readFileSync(
      new URL('../migrations/004-inbox-triage.sql', import.meta.url),
      'utf8',
    ),
  },
];
const checksum = (sql: string): string =>
  createHash('sha256').update(sql).digest('hex');
function mismatch(): never {
  throw new RuntimeStateError(
    'SCHEMA_MISMATCH',
    'Runtime state version, migration history, or schema differs from this release; use the matching release and migration instructions.',
  );
}

export function inspectMigrations(
  db: DatabaseSync,
  definitions: readonly Migration[] = migrations,
): number {
  try {
    if (
      !definitions.length ||
      definitions.some((item, index) => item.version !== index + 1)
    )
      return mismatch();
    const identity = db.prepare('PRAGMA application_id').get()?.[
      'application_id'
    ];
    const version = db.prepare('PRAGMA user_version').get()?.['user_version'];
    const objects = db
      .prepare("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'")
      .all();
    if (identity === 0 && version === 0 && objects.length === 0) return 0;
    if (identity !== APPLICATION_ID) {
      throw new RuntimeStateError(
        'UNSUPPORTED_DATABASE',
        'Select an MZ runtime database or a new empty database file.',
      );
    }
    if (
      typeof version !== 'number' ||
      version < 1 ||
      version > definitions.length
    )
      return mismatch();
    const rows = db
      .prepare(
        'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
      )
      .all();
    if (rows.length !== version) return mismatch();
    for (const [index, row] of rows.entries()) {
      const expected = definitions[index];
      if (
        !expected ||
        row['version'] !== expected.version ||
        row['name'] !== expected.name ||
        row['checksum'] !== checksum(expected.sql)
      )
        return mismatch();
    }
    return version;
  } catch (error) {
    throw stateError(error, 'SCHEMA_MISMATCH');
  }
}

export function applyMigrations(
  db: DatabaseSync,
  definitions: readonly Migration[] = migrations,
): void {
  let active = false;
  try {
    db.exec('BEGIN IMMEDIATE');
    active = true;
    const current = inspectMigrations(db, definitions);
    if (current > 0) verifySchema(db, definitions.slice(0, current));
    if (current === 0)
      db.exec(`CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY CHECK (version >= 1), name TEXT UNIQUE NOT NULL,
      checksum TEXT NOT NULL, applied_at TEXT NOT NULL
    ) STRICT`);
    for (const migration of definitions.slice(current)) {
      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
      ).run(
        migration.version,
        migration.name,
        checksum(migration.sql),
        new Date().toISOString(),
      );
      db.exec(`PRAGMA user_version = ${migration.version}`);
    }
    db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
    db.exec('COMMIT');
    active = false;
  } catch (error) {
    if (active) db.exec('ROLLBACK');
    throw stateError(error, 'MIGRATION_FAILED');
  }
}

export function verifySchema(
  db: DatabaseSync,
  definitions: readonly Migration[] = migrations,
): void {
  // Compare SQLite's own schema representation, rather than trust trigger names alone.
  const reference = new DatabaseSync(':memory:');
  try {
    applyMigrations(reference, definitions);
    const sql =
      "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY type, name";
    if (
      JSON.stringify(db.prepare(sql).all()) !==
      JSON.stringify(reference.prepare(sql).all())
    )
      return mismatch();
  } finally {
    reference.close();
  }
}
