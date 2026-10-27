# Runtime state schema v4

FR-009 adds [004-inbox-triage.sql](../packages/state/migrations/004-inbox-triage.sql) after immutable migrations001–003. Existing [v3 intake](runtime-state-v3.md), inbox, backup, run and event data remain unchanged.

New STRICT `inbox_triage_changes` stores a global append sequence, unique change UUID, inbox FK, positive per-item revision, actor UUID, change UTC timestamp, bounded classification, bounded scope, triaged integer0/1 and a unique event UUID FK. `(inbox_item_id,revision)` is unique. Classification is unclassified/idea/bug/feature/feedback/decision/reference/other; scope follows the existing intake vocabulary/slug rules.

Typed changes append an inbox.triaged event plus one full effective snapshot in the same transaction, increasing revision once. Failed insertion rolls back both. A no-op appends neither. Original intake scope/provenance is preserved; no arbitrary payload, source text/path/name, provider planning field or credential column is introduced. Legacy inbox rows need no intake metadata to be listed/triaged.

Update/delete triggers protect snapshots; a BEFORE INSERT trigger rejects replacement collisions on sequence/change identity/event identity/item revision even with recursive triggers disabled. As with existing event protection, a privileged administrator can remove triggers; no raw SQL is exposed by Core.

Views derive current local review state from the latest snapshot, otherwise initial intake/defaults. Source retention and provider work authority remain separate. [Inbox docs](../docs/inbox.md) describe read-only current-schema functions, bounded cursors, mutation migration behavior and recovery limitations. Migration/checksum/schema verification and atomic upgrade rules continue unchanged. A real v3 fixture verifies inbox/intake/backup/event preservation.
