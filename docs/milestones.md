# Milestones

Milestone numbers match section 24 of the [implementation plan](../MZ_IMPLEMENTATION_PLAN.md). These are planned outcomes, not completion claims. Future milestones do not authorize execution.

<a id="m-00"></a>

## M-00 Bootstrap repositories

Verified 2026-10-27: exit criteria met; see FR-001 and FR-013 for evidence. M-01 is the next implementation milestone.

Exit criteria: Public reusable implementation and private company knowledge have separate homes; organization structure is understandable without reading MZ source.

Tickets: [FR-001](tickets/FR-001.md), [FR-013](tickets/FR-013.md), [CR-001](tickets/CR-001.md), [CR-002](tickets/CR-002.md)

<a id="m-01"></a>

## M-01 Core domain and state boundary

Implementation exit verified 2026-10-27: [requirement-by-requirement evidence and live deployment limits](milestone-m01-verification.md). FR-002 through FR-007 are complete; M-02 is next.

Exit criteria: Company config and Core state operate without persisting credentials. Backup/restore contract and doctor health checks work.

Tickets: [FR-002](tickets/FR-002.md), [FR-003](tickets/FR-003.md), [FR-004](tickets/FR-004.md), [FR-005](tickets/FR-005.md), [FR-006](tickets/FR-006.md), [FR-007](tickets/FR-007.md)

<a id="m-02"></a>

## M-02 Intake and inbox

Exit criteria: A Markdown idea becomes an inbox item without manual restructuring and can be inspected and triaged.

Tickets: [FR-008](tickets/FR-008.md), [FR-009](tickets/FR-009.md)

<a id="m-03"></a>

## M-03 Context compiler and skill

Exit criteria: A fresh worker receives bounded useful context without old chat history, using the thin MZ skill.

Tickets: [FR-010](tickets/FR-010.md), [FR-011](tickets/FR-011.md)

<a id="m-04"></a>

## M-04 Project steward

Exit criteria: The owner can obtain status and discuss decisions and work without reconstructing project history.

Tickets: [FR-012](tickets/FR-012.md)

<a id="m-05"></a>

## M-05 First real pilot

Exit criteria: A real idea passes intake, triage, human activation, initial knowledge and independent assurance into development. Manual steps are allowed.

Tickets: Create scoped BUG/FR/CR tickets when this milestone becomes actionable; no speculative implementation tickets yet.

<a id="m-06"></a>

## M-06 Worker execution

Exit criteria: Only after the pilot proves context, implement mz work with workspace/tmux/Codex integration, scoped authority and handover.

Tickets: Create scoped BUG/FR/CR tickets when this milestone becomes actionable; no speculative implementation tickets yet.

<a id="m-07"></a>

## M-07 Assurance and operations automation

Exit criteria: Public projects have independent security/privacy review and monitoring ownership with explicit triggers and runbooks.

Tickets: Create scoped BUG/FR/CR tickets when this milestone becomes actionable; no speculative implementation tickets yet.

<a id="m-08"></a>

## M-08 Steering and learning

Exit criteria: Event-based steering surfaces project health and organizational friction; authority changes remain human decisions.

Tickets: Create scoped BUG/FR/CR tickets when this milestone becomes actionable; no speculative implementation tickets yet.

<a id="m-09"></a>

## M-09 Web interface

Exit criteria: Only after CLI and organization model are proven, provide a private UI over the same Core API.

Tickets: Create scoped BUG/FR/CR tickets when this milestone becomes actionable; no speculative implementation tickets yet.

Company work ORG-001 through ORG-007 remains defined in [the private organization repository](https://github.com/minizap-online/company). Track actual internal organization tasks in the private company repository when provisioned.
