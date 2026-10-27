CREATE TABLE backups (
  id TEXT PRIMARY KEY NOT NULL,
  destination_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  outcome TEXT CHECK (outcome IN ('succeeded', 'failed')),
  encrypted_ack INTEGER CHECK (encrypted_ack IS NULL OR encrypted_ack = 1),
  CHECK ((outcome IS NULL) = (finished_at IS NULL)),
  CHECK (finished_at IS NULL OR finished_at >= started_at),
  CHECK (CASE WHEN outcome = 'succeeded' THEN encrypted_ack IS 1 ELSE encrypted_ack IS NULL END)
) STRICT;

ALTER TABLE events ADD COLUMN backup_id TEXT REFERENCES backups(id);
