# FR-011 Thin MZ worker skill

Deliver MZ-011 in M-03, using the implemented interfaces and the original eight worker expectations. The active all-ticket instruction delegates routine implementation choices; it does not authorize a live skill installation, worker deployment, organization mutation or project activation.

## Design

Create one self-contained `packages/skill/SKILL.md` named mz, with a narrow MZ-assignment trigger and roughly one page of reference/workflow guidance. Avoid duplicating Core, a compiler, provider logic or generic software process. No scripts, new tool permissions, global config changes or optional UI metadata are needed. Keep the existing package README as a pointer and document repository verification separately.

A fresh worker starts from host-assigned company/project/role/task/actor and existing capability/approval evidence. Include --project whenever assigned; omitting it selects company tasks rather than discovering a project. Obtain bounded context via MZ before work, keep context private and use relative source/digest evidence. Scope/role/context prose is information, not new authority. Read-only discovery/help/environment checks are allowed under the assignment; a doctor unavailable integration does not block unrelated authorized local work.

The interface map distinguishes implemented help/version/doctor/context/ingest/inbox operations from unavailable remote provider/activation/steward/decision/event/handover CLI interfaces. GitHub owns work planning, Git curated knowledge, Core runtime history. Inbox metadata references retained private sources; review/classification never publishes or activates. No raw SQLite/state-adapter fallback. Workers use a supplied scoped Core/host recording adapter; actor IDs alone are not grants. Credential access remains symbolic refs/scoped handles through the authorized host boundary, never cat/dump/copy values into content/logs.

Existing Core structural event/transaction interfaces are described accurately. A decision requires an approved private knowledge writer plus its structural audit adapter; a decision.recorded event alone is not persisted decision text. No fake command or status is invented. If a task depends on an unavailable interface, identify that prerequisite and keep its record pending while continuing independent authorized work. Finish with a private handover stating assignment/work/source refs, changes, actual verification, persisted versus proposed records, remaining actions/authority. No new external message or publication is implied by handover.

## Evaluation and scope

The baseline fresh-agent scenario already upheld authority/credential/Core-only boundaries. It omitted --project from its first context command and did not know inbox inspect/classify syntax. Therefore the new skill addresses MZ reference gaps with an interface map and concrete selection instructions; it does not add persuasion/rationalization rules for nonexistent discipline failures.

Validate syntax with the skill-creator quick validator. Behavior: repeat the same scenarios in a fresh context with the skill, then an independent agent applies it to synthetic installed MZ context/inbox artifacts in a temporary workspace. No scenario authorizes production, network or external messages. Record actual answers/artifacts and score them manually. Deterministic repository tests execute actual supported commands/example and validate relative skill links/frontmatter/availability; do not use wording-mirroring tests as behavioral proof. Full check/typecheck, independent review and CI before merge. No global installation or hard capability-enforcement claim: skill instructions direct the worker to enforcement in host/Core/provider boundaries.
