CREATE TABLE steward_interactions (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  source_id TEXT UNIQUE NOT NULL,
  run_id TEXT UNIQUE NOT NULL REFERENCES runs(id),
  scope TEXT NOT NULL CHECK (scope = 'company' OR (
    substr(scope, 1, 8) = 'project:' AND length(substr(scope, 9)) BETWEEN 1 AND 64 AND
    substr(scope, 9, 1) GLOB '[a-z]' AND substr(scope, 9) NOT GLOB '*[^a-z0-9-]*'
  )),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE steward_decisions (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  interaction_id TEXT NOT NULL REFERENCES steward_interactions(id),
  proposal_index INTEGER NOT NULL CHECK (proposal_index BETWEEN 0 AND 15),
  actor_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  approval_id TEXT UNIQUE NOT NULL,
  event_id TEXT UNIQUE NOT NULL REFERENCES events(id),
  UNIQUE (interaction_id, proposal_index)
) STRICT;
CREATE TRIGGER steward_interactions_no_update BEFORE UPDATE ON steward_interactions
BEGIN SELECT RAISE(ABORT, 'steward_reference_append_only'); END;
CREATE TRIGGER steward_interactions_no_delete BEFORE DELETE ON steward_interactions
BEGIN SELECT RAISE(ABORT, 'steward_reference_append_only'); END;
CREATE TRIGGER steward_interactions_no_replace BEFORE INSERT ON steward_interactions
WHEN EXISTS (SELECT 1 FROM steward_interactions WHERE sequence = NEW.sequence OR id = NEW.id OR source_id = NEW.source_id OR run_id = NEW.run_id)
BEGIN SELECT RAISE(ABORT, 'steward_reference_append_only'); END;
CREATE TRIGGER steward_decisions_no_update BEFORE UPDATE ON steward_decisions
BEGIN SELECT RAISE(ABORT, 'steward_reference_append_only'); END;
CREATE TRIGGER steward_decisions_no_delete BEFORE DELETE ON steward_decisions
BEGIN SELECT RAISE(ABORT, 'steward_reference_append_only'); END;
CREATE TRIGGER steward_decisions_no_replace BEFORE INSERT ON steward_decisions
WHEN EXISTS (SELECT 1 FROM steward_decisions WHERE sequence = NEW.sequence OR id = NEW.id OR approval_id = NEW.approval_id OR event_id = NEW.event_id OR (interaction_id = NEW.interaction_id AND proposal_index = NEW.proposal_index))
BEGIN SELECT RAISE(ABORT, 'steward_reference_append_only'); END;
