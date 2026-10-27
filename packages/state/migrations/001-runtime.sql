CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  received_at TEXT NOT NULL
) STRICT;

CREATE TABLE runs (
  id TEXT PRIMARY KEY NOT NULL,
  worker_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  outcome TEXT CHECK (outcome IN ('succeeded', 'failed', 'cancelled')),
  CHECK ((finished_at IS NULL) = (outcome IS NULL)),
  CHECK (finished_at IS NULL OR finished_at >= started_at)
) STRICT;

CREATE TABLE events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'inbox.created', 'inbox.triaged', 'run.started', 'run.finished',
    'project.proposed', 'project.activated', 'project.archived', 'decision.recorded',
    'work.started', 'work.completed', 'work.blocked', 'pr.created', 'merge.completed',
    'deploy.started', 'deploy.completed', 'deploy.failed', 'deploy.rolled_back',
    'incident.opened', 'incident.remediated', 'incident.escalated', 'incident.closed',
    'security.reviewed', 'privacy.reviewed', 'human.intervention', 'context.miss',
    'capability.denied', 'capability.requested', 'capability.changed', 'backup.completed', 'backup.failed'
  )),
  actor_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  run_id TEXT REFERENCES runs(id),
  inbox_item_id TEXT REFERENCES inbox_items(id)
) STRICT;

CREATE TRIGGER events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'events_append_only'); END;

CREATE TRIGGER events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'events_append_only'); END;

-- REPLACE can bypass DELETE triggers when recursive_triggers is OFF.
CREATE TRIGGER events_no_replace BEFORE INSERT ON events
WHEN EXISTS (SELECT 1 FROM events WHERE id = NEW.id OR sequence = NEW.sequence)
BEGIN SELECT RAISE(ABORT, 'events_append_only'); END;
