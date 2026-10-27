CREATE TABLE inbox_intake (
  inbox_item_id TEXT PRIMARY KEY NOT NULL REFERENCES inbox_items(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('file', 'stdin')),
  source_bytes INTEGER NOT NULL CHECK (source_bytes BETWEEN 1 AND 1048576),
  scope TEXT NOT NULL DEFAULT 'unclassified' CHECK (
    scope IN ('unclassified', 'company', 'project-candidate') OR (
      substr(scope, 1, 8) = 'project:' AND
      length(substr(scope, 9)) BETWEEN 1 AND 64 AND
      substr(scope, 9, 1) GLOB '[a-z]' AND
      substr(scope, 9) NOT GLOB '*[^a-z0-9-]*'
    )
  ),
  created_by TEXT NOT NULL,
  summary_status TEXT NOT NULL DEFAULT 'pending' CHECK (summary_status = 'pending')
) STRICT;
