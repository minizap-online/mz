# Project steward

FR-012 adds read-only status and an advisory steward. Git owns curated knowledge, GitHub owns actionable work/planning, and Core owns structural runtime history. No proposal automatically changes triage, issues, knowledge, authority or activation.

## Status

```sh
mz status --project example-project --json
```

Select the private company via `--company`/`MZ_COMPANY_DIR` or existing discovery, and optionally the existing absolute database via `--runtime`/`MZ_RUNTIME_DB`. Status never initializes or upgrades a database. Missing/unreadable/unsupported runtime is reported unavailable. Existing malformed/unsafe curated evidence fails with a source-safe diagnostic.

Selected-project status captures only `projects/ID/project.yaml`, `STATUS.md` and `DECISIONS.md`. Company status captures optional `STATUS.md` and explicitly indexed projects. `projects/index.yaml` has exactly `schemaVersion: 1` and `projects: [slug, ...]`, at most 64 unique slugs. Missing files/index are listed as missing/unavailable, never evidence of a healthy empty organization. Activation metadata describes curated evidence and grants no authority. Strict normalized Core reads reject symbolic/hard-link aliases; normalized sources carry SHA256 digests. Captured evidence is limited to 64 KiB; the full status result to 96 KiB. Status output contains private curated material.

Runtime reports current-schema verified local counts for inbox review, runs, steward interactions/decisions, bounded recent structural references and backup freshness. Project queries filter SQL before exposing records. Company worker requests explicitly exclude project inventory and use only company-scoped history/facts; the direct organization status command intentionally aggregates organization state. Live provider work remains unavailable: curated text is not a live issue query.

## Ask and host configuration

```sh
mz ask question.md --role developer --project example-project --task review \
  --runtime /private/mz/state.sqlite3 --artifact-directory /private/mz/steward \
  --actor 11111111-1111-4111-8111-111111111111 \
  --worker 22222222-2222-4222-8222-222222222222 --json
```

The UUIDs above are synthetic examples, not authority. Use existing assigned identities and scope. `-` reads the question from stdin; file input must be a regular non-symlink file. Question bytes are UTF-8, at most 8192 bytes, without unsupported controls or obvious credentials. CLI requires explicit host environment settings before reading input:

| Setting                        | Meaning                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `MZ_COMPANY_DIR`               | Existing private curated company repository; explicit `--company` also supported                             |
| `MZ_RUNTIME_DB`                | Existing runtime database; `--runtime` overrides                                                             |
| `MZ_STEWARD_DIR`               | Existing private 0700 artifact directory outside Git; `--artifact-directory` overrides                       |
| `MZ_ACTOR_ID`, `MZ_WORKER_ID`  | Existing assigned UUIDs; corresponding flags override                                                        |
| `MZ_STEWARD_MODEL`             | Explicit model supporting Responses structured outputs; no default/fallback                                  |
| `MZ_STEWARD_MAX_OUTPUT_TOKENS` | Explicit per-call output/reasoning token ceiling, 16–8192                                                    |
| `MZ_STEWARD_SECRET_DIR`        | Protected private host directory containing a 0600 `openai-steward` file, bound to symbolic `openai:steward` |

Host secret ownership/ancestor checks follow [secret handling](secrets.md). Do not put a key in company files, question, environment arguments, Git, SQLite or handover. No setup creates a real key, selects a paid model or authorizes spending. The operator must already have authorization for model use, cost and transmitting the selected private material. Invoking configured ask performs one paid-capable external request; development fixtures make none.

The first adapter uses a fixed `https://api.openai.com/v1/responses` endpoint, POST with redirects rejected, scoped Core secret use, `tools: []`, `tool_choice: none`, `store: false`, no conversation/previous-response state, strict JSON schema, no retries and no fallback. It never launches a shell, Codex, MCP server or model tool. The original installed-Codex option was rejected because read-only filesystem sandboxing does not establish an advisory-only host-read boundary. These request controls follow the [official Responses reference](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create) and [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs). `store: false` is not a claim about all provider retention; check the provider's applicable data policy before live use.

A request includes the bounded compiled context, narrowly scoped current status, question, and at most four validated summaries from the latest eight same-scope interactions. Missing/corrupt successful history fails closed; it is not silently invented. Full request <=128 KiB, context defaults to 64 KiB, response <=32 KiB, each proposal list <=16 strings (each <=2048 bytes), answer <=8192 bytes and summary <=2048 bytes. CLI worker timeout is 60 seconds. The HTTP envelope is independently bounded to 256 KiB and the adapter honors abort. Token/time caps bound a call; they are not an account-wide financial budget. Common credential/control checks are conservative guards, not a general secret detector.

Output has answer/summary, decision, triage, work and knowledge-update proposals plus handover arrays: completed, changed, decisions, followups, risks, references. JSON/text output is private and describes advice. No activation, issue creation, triage or knowledge change occurs. Continue authorized local review through the existing inbox commands. A model claiming otherwise has not performed an action.

## Invocation and recording interfaces

Core exports `StewardRequest`, `StewardResponse`, `StewardWorker`, `StewardArtifacts` and response validation. A trusted host supplies `StewardWorker.invoke(request, signal)` with independently enforced scope, cost and cancellation. The worker receives a copy of the bounded data and no state, secret, writer or approval ports. The context package exports `askSteward` and `createOpenAIWorker`; an optional transport is a trusted host/test dependency, never model-selected configuration. The host must pair the state handle, runtime read path, company, artifact root and assignment correctly; this is not an authentication/capability service.

`askSteward` writes an exclusive private UUID directory/request before `startStewardInteraction`, which atomically records metadata, run and run.started. It validates the worker response, writes/syncs private response JSON (including summary and handover), then calls `finishStewardInteraction` to atomically finish the run and append run.finished. Files use 0600, directories 0700; files and directories are fsynced before recording success. Metadata contains only identities, scope, times, outcome and references. Raw question/context/prose/provider diagnostics never enter SQLite. Original errors are withheld.

Core also exports `recordApprovedStewardDecision`, `StewardDecisionApprover`, `StewardDecisionWriter`, and an exclusive durable `createPrivateStewardDecisionWriter({directory})`. The host supplies a real independent approver for the exact frozen proposal (text, scope, interaction, index, generated decision/knowledge ID). A successful receipt supplies approval/actor UUIDs. Those UUIDs identify existing authorization; a model or caller inventing one does not prove permission. There is no CLI approval shortcut. The writer persists `decision-UUID.md` under a host-selected private curated decisions directory, with scope, interaction, proposal index, approval and actor references. That directory may belong to the private company Git repository; no automatic commit/push occurs. The structural `recordStewardDecision` plus decision.recorded event is committed only after durable writing. Already recorded proposals fail before another approval/write; SQL uniqueness also protects concurrent reference attempts. Hosts should serialize decisions for the same proposal.

The low-level state methods are trusted control-plane primitives, not independent approval enforcement. A worker uses only a supplied scoped host adapter, never a broad state handle, SQLite connection or private writer. Typed reference/history methods and read-only `readStewardSnapshot` are exposed through Core. [Migration005](../packages/state/migrations/005-steward.sql) adds immutable structural interaction/decision references without changing migrations001–004 or adding prose/event payloads.

## Retention and failure recovery

Private artifacts are retained until explicit operator removal and require separately configured encrypted backup; a SQLite-only backup cannot restore their contents. There is no cross-filesystem/SQLite transaction. Failed artifact/request or database start operations may leave an unreferenced UUID directory. Worker/validation failures record failed runs when possible. A crash, audit failure or timeout with a noncooperative trusted adapter can leave pending runs; abort is not proof a provider incurred no charge. A durable response followed by an audit failure remains pending/failed, never falsely succeeded. A durable decision followed by reference failure can leave an orphan knowledge file, including a losing concurrent approval attempt.

Reconcile these cases privately through the trusted operator: compare source/interaction/run/approval references and durable files, preserve evidence, and inspect actual outcome before taking any explicit recovery action. Do not rewrite append-only history or infer success from a file alone. No automatic repair, deletion, retry, resubmission or publication is implemented. Missing retained successful response artifacts block dependent continuity. Retention changes require operator policy, not a worker cleanup heuristic.

## Verification and next boundary

Deterministic tests cover real CLI/status and configured adapter dispatch using synthetic HTTP transport, no-tools request construction, scoped secret use, output/refusal/HTTP/byte failures, same-scope history and bounds, lifecycle/event rollback, private permissions/link rejection, approval/write/event ordering, duplicate decisions, actual v4 inbox/triage/backup upgrade, SQL append-only constraints and pending recovery evidence. This proves implementation behavior, not live credentials/model availability, account limits, deployed backup or real pilot activation.

After implementation acceptance, [begin the real pilot](pilot-handoff.md). Do not expand MZ into M-06 worker execution before that evidence exists.
