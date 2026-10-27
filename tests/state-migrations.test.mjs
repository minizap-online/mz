import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  APPLICATION_ID,
  applyMigrations,
  inspectMigrations,
  migrations,
} from '../packages/state/dist/migrations.js';

const next = {
  version: 4,
  name: 'test_upgrade',
  sql: 'CREATE TABLE extra (id TEXT PRIMARY KEY) STRICT;',
};
function database(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  return db;
}

test('initial migration failure rolls back every table and both SQLite version markers', (t) => {
  const db = database(t);
  assert.throws(() =>
    applyMigrations(db, [
      ...migrations,
      { ...next, sql: next.sql + ' INVALID SQL;' },
    ]),
  );
  assert.deepEqual(
    db
      .prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'")
      .all(),
    [],
  );
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 0);
  assert.equal(db.prepare('PRAGMA application_id').get().application_id, 0);
  applyMigrations(db);
  assert.equal(inspectMigrations(db), 3);
});

test('incremental migration succeeds once, preserves history, and advances its checksum ledger', (t) => {
  const db = database(t);
  applyMigrations(db);
  db.prepare('INSERT INTO inbox_items VALUES (?, ?, ?)').run(
    'fixture',
    'source',
    'timestamp',
  );
  applyMigrations(db, [...migrations, next]);
  applyMigrations(db, [...migrations, next]);
  assert.equal(inspectMigrations(db, [...migrations, next]), 4);
  assert.equal(
    db.prepare('PRAGMA application_id').get().application_id,
    APPLICATION_ID,
  );
  assert.equal(
    db.prepare('SELECT count(*) AS n FROM schema_migrations').get().n,
    4,
  );
  assert.equal(db.prepare('SELECT id FROM inbox_items').get().id, 'fixture');
});

test('failed upgrade preserves existing data, schema and migration version', (t) => {
  const db = database(t);
  applyMigrations(db);
  db.prepare('INSERT INTO inbox_items VALUES (?, ?, ?)').run(
    'fixture',
    'source',
    'timestamp',
  );
  assert.throws(() =>
    applyMigrations(db, [
      ...migrations,
      { ...next, sql: next.sql + ' INVALID SQL;' },
    ]),
  );
  assert.equal(inspectMigrations(db), 3);
  assert.equal(
    db
      .prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='extra'")
      .get().n,
    0,
  );
  assert.equal(db.prepare('SELECT id FROM inbox_items').get().id, 'fixture');
});

test('drifted existing schema is rejected before applying an upgrade', (t) => {
  const db = database(t);
  applyMigrations(db);
  db.exec('DROP TRIGGER events_no_update');
  assert.throws(
    () => applyMigrations(db, [...migrations, next]),
    (e) => e.code === 'SCHEMA_MISMATCH',
  );
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
  assert.equal(
    db
      .prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='extra'")
      .get().n,
    0,
  );
});
