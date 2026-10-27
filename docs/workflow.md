# Ticket workflow

MZ uses the same file-based ticket convention as the other MiniZap projects. Register work before implementation and update its status, dependencies and verification evidence before ending a work session.

## Types and identifiers

- FR: a new capability.
- CR: a change to agreed behavior, design, scope or working conventions.
- BUG: behavior that fails the specification; include reproduction, expected/actual results and evidence.
- Milestones group outcomes and use M-00 through M-09, matching the implementation plan.

IDs are stable, sequential within each type, and never reused. Original MZ-001 through MZ-012 identifiers remain as legacy references on FR-001 through FR-012. GitHub issue numbers are external references, not replacements for ticket IDs. Do not invent BUG tickets for features that have not been implemented.

## Lifecycle and evidence

Proposed → Ready → In progress → Review → Done. Blocked records a concrete missing dependency and the next action; resume the appropriate prior state when resolved.

Ready means scope is clear and prerequisites are satisfied; it does not authorize implementation of a future milestone. Done requires the acceptance criteria and actual verification evidence. Documentation checks do not prove runtime, deployment, authentication or restore behavior. Record limitations explicitly.

Priorities: P0 urgent security/data-loss or critical outage; P1 required milestone work; P2 useful improvement; P3 deferred refinement.

GitHub owns operational status, priority, and milestone; each linked ticket file mirrors those fields and records acceptance and evidence. The register links tickets and milestones without duplicating status. Milestones describe exit criteria rather than copies of ticket acceptance.

## GitHub and privacy

Target organization: minizap-online. Public reusable implementation belongs in minizap-online/mz; private company configuration, organization planning and runtime information belong in minizap-online/company.

GitHub Issues are the operational work queue, with planning fields in the private organization Project. Each local ticket links to its issue; mirror file changes to issue bodies, labels and Project fields in the same work session. Record a pending synchronization if access is unavailable. Do not maintain an independent status in the register or silently overwrite conflicting updates; reconcile against evidence and record the result in the ticket.

Generic MZ implementation tickets may be public. Internal company tickets and the organization planning board must remain private. Credentials never belong in tickets, examples, Git or transcripts.

Use issue title prefixes BUG-NNN, FR-NNN and CR-NNN, corresponding type labels, priority labels and milestones. A Project board can use Proposed, Ready, In progress, Review, Done and Blocked. Do not build synchronization automation before a real need exists.

## Source-of-truth boundary (CR-002)

GitHub Issues and Projects own actionable work and planning fields. Git owns curated knowledge. SQLite will hold execution history and references through Core; it must not become a competing editable tracker. Private intake stays private until deliberate sanitized promotion to a linked issue. Runtime history remains append-only, and project activation retains human authorization. See [architecture](architecture.md).

## Scope and session handoff

M-00 is complete: the TypeScript workspace, help/version CLI, public/private repositories, issues, and private planning Project are verified. Current work is M-01, starting with FR-002 company repository loading. Runtime state, secret providers, backup/restore, provider interfaces, and doctor remain separate tickets.

Follow milestones in order. After FR-012, start the real pilot before adding later automation. Normal work inside authorized scope does not require repeated approval; organizational authority changes, spending and project activation retain the design's human boundary.

Before stopping, update affected tickets and report completed outcomes, verification, outstanding prerequisites and the next actionable ticket. Reference IDs in commits and PRs. Record material design departures as CRs and decisions/ADRs.
