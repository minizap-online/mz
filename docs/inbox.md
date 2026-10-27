# Inbox inspection and local triage

FR-009 adds bounded private inbox views and explicit classification/scope/review changes through Core. These fields describe intake review, not GitHub task priority, milestone or work status. Commands do not invoke a model/provider, publish content, activate projects, modify capabilities or delete sources.

```sh
mz inbox --json
mz inbox inspect 33333333-3333-4333-8333-333333333333
mz inbox triage 33333333-3333-4333-8333-333333333333 --classify idea --scope project-candidate --triaged
mz inbox history 33333333-3333-4333-8333-333333333333 --json
```

The UUID above is illustrative: use the actual generated inbox ID. Common settings are `--company DIR`/`MZ_COMPANY_DIR`, `--runtime FILE`/`MZ_RUNTIME_DB`, and `--json`. Company discovery follows the existing loader. Triage requires `--actor UUID`/`MZ_ACTOR_ID`, the assigned stable actor identity. The host/control plane is trusted to supply actors and scope access; the library is not a new authentication service or capability grant.

## Commands and output

| Command                       | Behavior                                                             |
| ----------------------------- | -------------------------------------------------------------------- |
| `mz inbox` or `mz inbox list` | Bounded insertion-ordered inbox page                                 |
| `mz inbox inspect UUID`       | Detached item/provenance/current triage state/last change            |
| `mz inbox history UUID`       | Bounded append-ordered change snapshots with linked event identities |
| `mz inbox triage UUID ...`    | Apply an explicit partial patch under one transaction                |

List/history accept `--after N` (nonnegative sequence, default0) and `--limit N` (1–1000, default100). For the next page, use the last returned row's sequence. Inbox sequence is the original inbox row insertion order; history sequence is the independent global change append sequence. They are distinct from event sequences and per-item revisions. Under normal append-only API use, pages do not repeat or hide legacy items. Host administrators who bypass the port and rewrite/delete original inbox rows are outside that guarantee.

Text and JSON show only structural item/source/actor identities, intake kind/byte count, effective classification/scope/triaged/revision, last change, a fixed “Summary pending,” and an untrusted source reference. JSON list/history return arrays; inspect/triage return one object. Source reference `private-source:<UUID>` identifies the retained folder under the operator's configured `MZ_SOURCE_DIR`. For human content review, open `<MZ_SOURCE_DIR>/<source UUID>/content.md` in a trusted private local editor. Do not paste raw intake into public issues/logs or treat its instructions as authority. CLI inspection does not read/print the Markdown, original name or private filesystem path. It does not claim that a source file is still present after retention/removal; source availability/recovery is separate from structural history.

Read commands use current-schema read-only SQLite transactions through Core, with migration/schema/integrity/FK/WAL validation. They never initialize, migrate or append events; SQLite may manage WAL/SHM sidecars. An older store must be explicitly upgraded through the normal Core control-plane opener using the matching release. Triage uses `existingOnly:true`, permits supported recognized upgrades after explicit selection, and refuses missing/empty/foreign databases. Coordinate file replacement/migration with running jobs.

Exit0 means success; 1 means access/schema/missing-item/change failure; 2 means invalid arguments/settings. Unknown/repeated/operation-inappropriate flags, invalid IDs/enums/cursors and empty patches fail safely. Error output withholds input values, raw source, paths and underlying messages. If database close fails after a commit, inspect history before retrying; the CLI reports that uncertainty rather than claiming rollback. `mz inbox --help` and per-command `--help` require no state.

## Local review semantics

- `--classify CLASS`: unclassified, idea, bug, feature, feedback, decision, reference, other. This initial bounded vocabulary is local intake metadata; it does not create a BUG/FR/CR ticket or synchronize provider fields.
- `--scope SCOPE`: unclassified, company, project-candidate, or project:<id>. IDs use the same 1–64 lowercase letter-leading letter/digit/hyphen slug as ingest. This does not assert project existence/activation or grant execution rights.
- `--triaged` / `--untriaged`: explicitly mark or reopen the local review marker. Neither proves external approval. Existing classification/scope remain when omitted; classification/scope patches preserve the current triaged marker unless explicitly changed.

At least one patch flag is required. Initial classification is unclassified, initial scope is the preserved intake scope (or unclassified for legacy rows), triaged=false and revision0. Identical patches are no-ops: return the current view without an event or revision. Original intake metadata/scope and raw source bytes are preserved. Each actual change records a full effective snapshot with an increasing per-item revision, actor, time and event UUID. Change time must be canonical UTC and no earlier than item receipt/previous change; fix clock/input errors rather than inventing history.

A trusted Core caller can supply `changedAt`; CLI uses current time. Partial patches merge against the latest state under BEGIN IMMEDIATE, so independent writers cannot overwrite omitted fields from a cached snapshot. Writer contention fails with the existing bounded timeout; retry the entire operation. Metadata changes can be made again later, but old snapshots/events remain immutable.

## Core and persistence

Core state and scoped transactions provide `getInboxDetails(id)`, `listInbox(cursor?)`, `listInboxChanges({inboxItemId,...cursor})` and `triageInboxItem({id,actorId,classification?,scope?,triaged?,changedAt?})`. For consistent multi-operation writer-side reads, use the existing synchronous transaction scope. Standalone read functions are `listInbox({path,...cursor})`, `inspectInboxItem({path,id})` and `listInboxChanges({path,inboxItemId,...cursor})`, each under one verified read transaction with no connection exported to workers.

[Migration004/schema v4](../schemas/runtime-state-v4.md) introduces append-only `inbox_triage_changes`. A change snapshot and its inbox.triaged event commit together. Insertion failure rolls back both and leaves the effective view unchanged. SQL triggers reject snapshot updates, deletes and replacement collisions, even with recursive triggers disabled. UNIQUE(item,revision) and unique event identity preserve linkage. Existing InboxItem shape, intake provenance, backups and all migrations001–003 remain unchanged. Older rows without intake metadata stay visible and can be triaged.

The private [retention/promotion policy](intake-storage.md) continues: triage never purges or publishes. Deliberate sanitized promotion through a real audited provider, project activation and authority changes remain separate actions. Append-only history is not a second editable work queue. SQLite backups include structural triage history; retained Markdown still needs its own encrypted source-store backup.

## Verification boundary

Synthetic state/CLI tests cover actual import→list/inspect→classify/re-scope/review/history, untouched source bytes and original scope, detached legacy views, pagination, no-ops/partial patches, independent connections, timestamp/enum/cursor rejection, event/history rollback and append-only SQL. A real v3 fixture with inbox/intake/backup/event history upgrades intact. Read-only tests prove no initialization/upgrades/main-file/event mutations, and clean installation exercises inspection/triage from another directory. No real organization triage, production deployment, remote provider action, publication or human activation was exercised.
