CREATE TABLE inbox_triage_changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  inbox_item_id TEXT NOT NULL REFERENCES inbox_items(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  actor_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('unclassified', 'idea', 'bug', 'feature', 'feedback', 'decision', 'reference', 'other')),
  scope TEXT NOT NULL CHECK (
    scope IN ('unclassified', 'company', 'project-candidate') OR (
      substr(scope, 1, 8) = 'project:' AND
      length(substr(scope, 9)) BETWEEN 1 AND 64 AND
      substr(scope, 9, 1) GLOB '[a-z]' AND
      substr(scope, 9) NOT GLOB '*[^a-z0-9-]*'
    )
  ),
  triaged INTEGER NOT NULL CHECK (triaged IN (0, 1)),
  event_id TEXT UNIQUE NOT NULL REFERENCES events(id),
  UNIQUE (inbox_item_id, revision)
) STRICT;
CREATE TRIGGER inbox_triage_no_update BEFORE UPDATE ON inbox_triage_changes
BEGIN SELECT RAISE(ABORT, 'inbox_triage_append_only'); END;
CREATE TRIGGER inbox_triage_no_delete BEFORE DELETE ON inbox_triage_changes
BEGIN SELECT RAISE(ABORT, 'inbox_triage_append_only'); END;
CREATE TRIGGER inbox_triage_no_replace BEFORE INSERT ON inbox_triage_changes
WHEN EXISTS (
  SELECT 1 FROM inbox_triage_changes
  WHERE id = NEW.id OR sequence = NEW.sequence OR event_id = NEW.event_id OR
    (inbox_item_id = NEW.inbox_item_id AND revision = NEW.revision)
)
BEGIN SELECT RAISE(ABORT, 'inbox_triage_append_only'); END;
