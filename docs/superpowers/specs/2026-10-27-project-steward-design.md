# FR-012 Project steward

Implement MZ-012 in M-04 after M-03 exit, then stop expanding functionality and begin the real pilot through its human boundary. No actual model spending, credentials, organization state mutation, publication or activation is performed by development fixtures.

## Outcome and architecture

`mz status` reports company/project curated evidence separately from verified runtime facts and unavailable live-provider truth. `mz ask` invokes a configured advisory worker with bounded compiled context, current scoped status, question and bounded same-scope interaction summaries. It returns structured answer/summary plus decision, intake-triage, work and knowledge-update proposals. Worker output is untrusted advice, never an executable action or new authority. Missing worker/provider configuration is unavailable rather than fake success.

Core owns neutral worker/request/response contracts and structural runtime recording. The context package compiles/sanitizes status and request, persists private interaction artifacts and orchestrates a worker. Vendor/process invocation is isolated behind a trusted worker interface; backend preference is pending while neutral work proceeds. Do not let question/model output select an executable, credential binding, endpoint, model or permissions. Actual configured invocations require the caller's existing approved worker/budget scope; fixtures invoke only synthetic workers. Real project activation/spending/authority changes retain human authorization.

## Persistence

Migration005 adds structural steward_interactions (sequence, UUID, private source UUID, unique run FK, company/project scope, createdAt/actor) and steward_decisions (UUID, interaction FK, proposal index, actor/time, approval UUID and unique decision.recorded event FK). No question/answer/summary/decision prose, credential value, filename or provider error enters SQLite. Existing run.started/run.finished/decision.recorded vocabulary suffices; no arbitrary event payload or worker-supplied SQL.

Core operations atomically begin an interaction/run and atomically finish the run/outcome. Decisions record a structural approval/reference linked to the interaction run and event. All immutable reference records resist SQL update/delete/replace. Bounded typed read/history and read-only status snapshot functions use the existing verified current-schema transaction. Existing state shapes and migrations001–004 remain unchanged; actual v4 migration and restore data preservation are tested.

The private data root follows intake/backup host ownership/ancestor rules and stays outside Git. Per-interaction UUID directory stores private request/context and validated response/handover artifacts using exclusive0600 files/0700 directories and fsync before committed reference/outcome. Source copies remain until explicit operator removal, with separate encrypted backup. Pending run references plus crash/orphan reconciliation are explicit. Never claim cross-store atomicity. No raw worker stderr/provider message is stored or printed on failure.

## Status and continuity

Company status includes config identity, optional curated STATUS.md and explicitly indexed project summaries (projects/index.yaml schemaVersion1/projects slug array, max64). Missing index/status is unavailable, not an empty healthy organization. Selected project status reads only its project.yaml/STATUS.md/DECISIONS.md and shows activation as curated metadata, not an authority grant. Use strict normalized Core reads, bounded content, source digests and credential/control guards. Live GitHub work remains unavailable with the current domain skeleton. No remote action is required to inspect local state.

Runtime facts include bounded scoped inbox/run/interaction/decision counts, backup freshness and recent structural interactions. For a project, filter in SQL by effective inbox scope and interaction/run scope before returning data; do not leak other projects into a worker request. Organization view intentionally aggregates its configured inventory. Worker history reads only validated same-scope successful interaction summaries, bounded by count/bytes; no old chat-session memory is required. Raw private artifacts never appear in diagnostic logs or status JSON; explicit ask/history response display is private user output after credential/control checks.

## Recording and approval

Advisory responses do not directly triage, create issues, update knowledge, activate projects or approve decisions. Local triage remains the explicit implemented inbox interface. A confirmed decision uses a separate trusted approval/knowledge-writer boundary; approval UUIDs identify externally authorized receipts, not self-issued grants. The private knowledge writer materializes decision text under decisions/decision-<UUID>.md; a linked structural decision.recorded event marks the reference only after durable writing succeeds. Describe/verify this interface with a synthetic authorizer/writer; never treat model text as approval or auto-commit public Git. Durable interaction response contains a structured handover and proposals, not a claim that proposals were applied.

## Interfaces and verification

CLI status accepts optional project plus existing company/runtime settings and bounded JSON/text output. Ask accepts assigned role/project/task/actor/worker identity, explicit private data root and bounded question from stdin/file; no inline credential/long prompt arguments. Discovery/help works without setup. Worker configuration is host-controlled and immutable during a request; fail without it. Exact backend CLI/adapter options will be recorded after the requested preference is settled or an explicit implementation ruling.

Test real CLI/status, neutral worker invocation/failure/bounds, structured response validation, same-scope history, private request/response persistence, metadata-only runtime, safe diagnostics, decision approval/write/audit ordering, read-only missing/old state behavior, v4 upgrade/restore and installed interfaces. A real invocation adapter must be exercised with deterministic local fixtures without claiming live model/account readiness. Independent review/CI precede merge. Prepare a concrete pilot handoff; actual idea/activation/operational prerequisites require the human, rather than inventing a project or continuing MZ automation.
