# Provider Abstractions Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver FR-006/MZ-006 without remote operations.

**Architecture:** Core owns neutral DTOs/interfaces and safe errors; @mz/github implements an offline skeleton with an injected structural audit sink. No SDK or raw GitHub objects enter Core.

**Tech stack:** Strict ESM TypeScript, npm workspace dependencies, node:test.

**Spec:** docs/superpowers/specs/2026-10-27-provider-abstractions-design.md.

## Global constraints

- Stay in M-01; no real provider action, token, deployment provider or synchronization service.
- All attempted valid actions require start and outcome audit acknowledgements; no input content, credentials or URLs in audit records.
- Provider references are scoped identities; URLs grant no authority.
- Static safe errors only; no caught messages/causes or getter evaluation.

## Review focus

- Invalid action identities/target scoping must fail before auditing or any external action.
- Audit failure must not be mistaken for successful action or expose its original error.
- Work item content/URLs must not enter structural audit fields.
- GitHub package must work after a clean install/build and Core must stay vendor-independent.

## Task 1: Neutral contracts and audited offline skeleton

Files: packages/core/src/providers.ts, core index, packages/providers/github/src/index.ts, github package/tsconfig, package-lock.json, tests/providers.test.mjs, tests/provider-types.test.mjs, tests/fixtures/provider-contracts.mts, tests/install.test.mjs.

- [x] Register/reconcile FR-006 and sync In progress.
- [x] Add failing behavior/type tests for reference scoping, audit phases, redaction boundary, invalid inputs and sink failure.
- [x] Implement small Core interfaces and source-safe errors.
- [x] Implement GitHub skeleton with validated inputs and acknowledged structural auditing, without remote calls.
- [x] Verify clean installation and full check/typecheck.

## Task 2: Documentation, review and integration

Files: docs/providers.md, README/AGENTS/architecture/workflow, FR-006 ticket and this ledger.

- [x] Document boundaries, scoped identities, audit sink durability, no remote implementation and future authorization requirements.
- [x] Run independent review, fix findings, verify checks/diff/links.
- [x] Create PR, verify exact-head CI, merge, verify main and sync issue/Project Done. Continue FR-007 doctor.

## Execution ledger

- Routine design delegated by the active all-ticket instruction. No human deployment/authority decision is needed for an offline skeleton.

- Verification: runtime red (16 failures) to green (16); full check 211/211, typecheck, diff and local links passed. Negative compile checks and fresh install verified. Independent review in progress.

- Independent review: no actionable findings; reviewer passed provider/declaration (17) and clean-install (1) checks.

- Integration: PR #21 merged as 2922ced after both exact-head CI runs passed. Merged main check/typecheck passed (211 tests). FR-006 issue/Project synchronized Done. Next actionable ticket: FR-007 doctor.
