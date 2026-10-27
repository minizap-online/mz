# FR-009 Inbox triage

Deliver MZ-009 in M-02 after FR-008. The active all-ticket goal delegates routine design choices. Preserve the existing private intake retention/promotion policy; no real items are changed during implementation.

## Approach and boundaries

Mutable arbitrary task-like fields in SQLite would compete with GitHub work authority and lose history. Rewriting append-only events would violate the runtime boundary. Use bounded Core inbox views and a typed append-only triage change table, each row paired atomically with an inbox.triaged event. Scope/classification/triaged describe private intake review only, not operational task status or project activation. No provider, model, publication or deletion is invoked.

Inspection returns item/intake metadata, effective scope/classification/triaged state, last change/revision, fixed pending summary and the private source UUID reference. It does not load/print Markdown, paths or original basenames; operators can inspect the retained source using its UUID under configured private storage in their trusted local editor. Raw source absence after operator retention removal does not erase history. No source-store access is required to list/inspect metadata.

Classification vocabulary (implementation choice): unclassified, idea, bug, feature, feedback, decision, reference, other. Initial state: unclassified, initial intake scope or unclassified for legacy rows, triaged=false, revision=0. A patch can change classification, scope and/or triaged boolean, with explicit actor UUID and optional canonical changedAt. At least one field is required. A no-op returns the current state without a new event/revision. Partial patches merge against the latest state under BEGIN IMMEDIATE. Change time must be no earlier than the previous change or item receipt. No hidden inference of classification or execution authority.

## Persistence and APIs

Migration 004 adds inbox_triage_changes: global append sequence, change UUID, item FK, per-item positive revision, actor/time, snapshot of classification/scope/triaged, unique linked event UUID FK. UNIQUE(item,revision) and append-only update/delete/replace triggers preserve history. Existing tables/migrations remain unchanged. State inserts the event and change snapshot in one transaction; any failure rolls back both. Initial intake scope remains preserved separately.

Core state/transaction methods: getInboxDetails(id), listInbox({afterSequence?,limit?}), listInboxChanges({inboxItemId,afterSequence?,limit?}), triageInboxItem({id,actorId,classification?,scope?,triaged?,changedAt?}). Inbox listing uses stable insertion rowid sequence; histories use their append sequence. Defaults 100, range1..1000, forward cursors. Legacy items remain visible without intake metadata. Returned values are detached; no raw connection/SQL is exposed.

For CLI read commands, add specialized read-only Core functions listInbox({path,...cursor}), inspectInboxItem({path,id}), listInboxChanges({path,inboxItemId,...cursor}). Reuse the existing verified current-schema read transaction helper from diagnostic inspection. They neither create/migrate a database nor write events; SQLite may manage WAL sidecars. Triage uses the existingOnly state opener and supports recognized forward migrations after explicit runtime selection. A read against an older schema tells the operator to migrate deliberately, never initializes it.

CLI commands: mz inbox (alias list), mz inbox list, mz inbox inspect UUID, mz inbox history UUID, mz inbox triage UUID --classify CLASS --scope SCOPE --triaged|--untriaged. Common --company/--runtime use existing environment/discovery conventions; --json works everywhere. List/history accept --after N and --limit N. Triage additionally requires --actor (MZ_ACTOR_ID fallback). Strict operation-specific option parsing, no source/unknown argument echo, exit0 success,1 access/missing/conflict failure,2 invalid invocation. Text and JSON contain only validated structural metadata/fixed summaries; no source body or automatic promotion.

## Verification

Deterministic state and real CLI tests prove legacy visibility, stable pagination, detached inspection, all classification/scope changes, marking/unmarking, no-op semantics, partial patch merging, monotonic revisions/time, append-only triggers including REPLACE, atomic event/history rollback, sync transaction protections and read-only missing/old/current state behavior. Upgrade a real v3 fixture including intake/backup/event history. Preserve raw source files/initial scope and forbid arbitrary payloads. Full check/typecheck, clean install, independent review and exact-head CI before merge. No production triage or remote provider work is claimed.
