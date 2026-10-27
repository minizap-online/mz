# Thin MZ worker skill

FR-011 provides [packages/skill/SKILL.md](../packages/skill/SKILL.md), named `mz`. Supply that folder through the assigning host's existing skill harness, or explicitly provide its entrypoint to the worker. It is self-contained; it does not need this repository's documentation tree to perform the basic workflow. No global installation, invocation policy change, worker launcher, credential mount or tool permission is performed by this repository.

The entrypoint teaches assigned company/role/project/task/actor selection, bounded MZ context, private inbox metadata/source references, current CLI availability, scoped Core/credential boundaries and an honest private handover. In particular, a project assignment must pass `--project`: omission selects a company-level task path. The bundled planning example executes against the generic starter; real workers use their existing assigned identifiers and host-selected company context.

The interface map is an implementation snapshot. Installed `mz --help`/subcommand help is the availability check; future interface changes must update the skill and tests with their implementing ticket. Doctor can report unconfigured/unsupported integrations without blocking unrelated authorized local work. No model/provider result or context prose grants capabilities. Hosts/Core/providers remain responsible for enforcement outside the prompt. Keep existing approvals; do not add repeated approval loops for actions already authorized.

## Recording prerequisites

The current CLI provides help/version, doctor, context, ingest and local inbox list/inspect/history/triage. Remote GitHub domain actions and steward/status are not implemented at this milestone. Decision/event/handover CLI writers are also unavailable.

Core supports structural event append/transactions. An assigned worker uses these only through a supplied authorized scoped host/Core adapter; an actor UUID alone is not a recording grant. A decision additionally requires an approved private knowledge writer, because arbitrary rationale is not an event payload. `decision.recorded` alone does not persist decision text. A conversational handover can report actual work/pending records to its assigning user, but cannot be claimed as a durable MZ handover. Required unavailable interfaces are explicit prerequisites; block only the dependent operation and continue independent authorized work.

The skill implements none of those missing domain interfaces and grants no exception for raw SQLite/state-adapter reads, credential dumping, permission expansion, activation or publication. New authority and project activation retain their applicable human boundary. Approved private source review/classification does not imply publishing feedback or changing GitHub work state.

## Verification evidence

The [scenario set](superpowers/evaluations/2026-10-27-mz-skill-scenarios.md) was run first without the skill. [Baseline observation](superpowers/evaluations/2026-10-27-mz-skill-baseline.md) showed a project-selection/interface knowledge gap while preserving safety boundaries. The skill was written to address those observed gaps rather than add speculative discipline rules.

[Skill-present/application evidence](superpowers/evaluations/2026-10-27-mz-skill-green.md) records a fresh agent's corrected commands and an independent worker's actual installed-MZ context/inspection/triage/history workflow in temporary synthetic fixtures. Parent checks verified persisted data/event linkage and unchanged source/company files. This proves that a fresh worker can obtain bounded useful assigned context and follow the documented metadata workflow without old chat history. It does not prove production authorization enforcement or real remote access.

The skill-creator quick validator passed. [Repository tests](../tests/skill.test.mjs) validate discovery frontmatter/portable references, execute all CLI prefixes marked Available against the actual entry point, and run the planning example to verify selected-project/bounded context. These tests complement the behavioral evaluations; text matching is not treated as proof of behavior. Existing build, lint, formatting, typecheck, context/privacy/runtime and clean-install checks remain required.

No actual organization source, credential, remote action, application-level model API integration, global skill deployment or production worker was used. Fresh model agents ran only through the provided evaluation harness. The fixture's real local MZ review update is the only evaluated mutation; all temporary artifacts belong to that test.
