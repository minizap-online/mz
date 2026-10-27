# Project Steward Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver FR-012 status/ask/recording, then prepare the real pilot human handoff without further MZ expansion.

**Architecture:** Core neutral contracts/structural state, context-package status/worker orchestration, isolated configured worker adapter, private immutable interaction artifacts and explicit approved decision writer. No model action is automatically applied.

**Tech stack:** Existing strict TypeScript/Core/SQLite/filesystem/CLI; exact backend isolated pending preference. No real model call in development fixtures.

**Spec:** docs/superpowers/specs/2026-10-27-project-steward-design.md.

## Constraints

- M-04 only, stop automation expansion after this ticket and begin the real pilot through the human boundary.
- Only metadata/identities/outcomes in SQLite; raw question/context/response/decisions stay private and credential-free.
- Current curated evidence, verified runtime facts and unavailable provider truth are separate.
- Project worker requests/history cannot include another project's scope. All input/output/count/byte/time bounds are enforced.
- Worker proposals do not grant permission or execute actions; decisions require an independent trusted approval/writer interface.

## Task 1: Neutral state and read-only status

- [x] Reconcile/sync FR-012; record backend question and independent-work scope.
- [x] Failing tests for migration005 interaction/run/decision atomicity, scopes, append-only references, read-only facts and v4 preservation.
- [x] Implement typed Core/state records/readers and neutral worker contract.
- [x] Implement bounded curated status with source evidence and honest unavailable fields; real CLI/status tests.

## Task 2: Bounded worker and private recording

- [x] Resolve/requested backend or record a justified isolated adapter choice, verify exact invocation contract from authoritative sources.
- [x] Failing tests for request/response validation, same-scope history, bounds/failures and no action execution.
- [x] Implement actual configured invocation adapter and ask orchestration/private durable artifacts with run outcomes.
- [x] Implement/test explicit approved decision private knowledge writer plus structural audit linkage.
- [x] Strict CLI ask/host config, installed workflow and safe output; update thin skill using observed interface tests.

## Task 3: Integration and pilot handoff

- [x] Documentation, current interface/recording contracts, operational limits and concrete real-pilot handoff.
- [x] Independent review and regression fixes; check/typecheck/diff/links/skill validation.
- [x] PR/CI/merge/main verification, issue/Project evidence; keep real-pilot acceptance unproven until actual human-authorized start.
- [ ] Request only the necessary missing pilot/operational authorization once concrete reviewable work is ready. No speculative M-05+ functionality.

## Ledger

- User backend preference requested early; status/recording work can proceed independently. No answer/timeout is spending or production approval.
- Ruling: keep the steward advisory; use explicit trusted approval/writer boundaries for actual decisions and existing inbox commands for local triage. Do not implement worker execution/activation automation.

- Task 1/2 progress: migration005 + typed state/snapshot tests (11), bounded status (3), response contract (1), private artifacts (1), ask continuity/failure/pending (4), actual OpenAI adapter with synthetic transport (2), approved private decisions (3), installed CLI (3) implemented and individually verified.
- Ruling: use fixed-endpoint tool-free OpenAI Responses rather than installed Codex — local read-only sandbox does not establish the required no-host-read/advisory boundary; explicit host model/key/token configuration is required and no live request is authorized by a missing preference reply. Cost if wrong: a different backend remains a later adapter choice; no default spending or model is introduced.
- Ruling: approved decision writes precede SQLite, with retained orphan evidence on reference failure — no cross-store transaction exists. Cost if wrong: operator must reconcile orphan files; no false success or overwritten history.
- Full baseline after foundation: npm run check passed 385 tests. Subsequent task checks in progress; new regression tests verify duplicate approval/write prevention and durable-response/pending-state recovery. Real pilot remains unstarted.

- Task 1/2 complete at 9e0da5f: npm run check passed 402/402 tests plus build/lint/format; npm run typecheck, skill quick validator and changed-doc local links passed. Task 3 independent review underway. Fresh reference baseline/green both preserved authority boundaries and corrected the obsolete steward availability gap.

- Final review: /root/fr012_review examined the complete implementation at 9e0da5f and ran 28 steward tests. No Critical/Important issues reported; one output-bound finding reported Minor.
- Final: Ruling: re-grade default status indentation overflow as Important — the emitted CLI output must honor its documented 96 KiB limit. Cost if wrong: a compact fallback reduces formatting for unusually nested evidence; no source is silently dropped.
- Final: Ruling: live OpenAI compatibility, billing and retention remain host operational prerequisites — fixtures prove protocol handling without real calls. Cost if wrong: live use can fail or incur unauthorized cost if an operator bypasses provisioning/consent.
- Final: Ruling: production authorization and host handle pairing remain outside this local implementation — trusted hosts must scope and pair company/runtime/artifact ports. Cost if wrong: a misconfigured trusted host can expose an incorrect scope.
- Final: Ruling: malicious privileged host code and concurrent same-owner filesystem mutation remain outside the trust boundary — workers receive data only, not host capabilities. Cost if wrong: host compromise can defeat filesystem controls.
- Final: Ruling: cross-store reconciliation and same-proposal serialization remain explicit operator duties — SQL references stay unique and failures preserve orphan evidence. Cost if wrong: concurrency/failure requires private manual reconciliation.
- Final: Ruling: deployed artifact backups and actual pilot activation remain unverified prerequisites — development fixtures are not operational acceptance. Cost if wrong: live operation without provisioning could lose private continuity or activate unauthorized work.

- Final: fixed rendered-status bound — regression failed at 222+ KiB then passed with compact fallback; full npm run check passed 403/403 tests, build/lint/format and npm run typecheck passed. No deferred Minor findings remain. The one fresh review is complete; no second review requested.

- Task 3 implementation integration complete: PR27 merged as 476036d after exact-head push/PR CI success. Main npm run check passed 403/403 and typecheck passed. Human real-pilot start remains pending; no later automation is authorized by synthetic evidence. Request the concrete owner idea/scope at handoff.
