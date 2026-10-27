# Backup and Restore Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver FR-005/MZ-005 and separate fixture proof from live operational prerequisites.

**Architecture:** Node SQLite online backup behind private state integration helpers; Core manages private staging and an external encrypted-storage hook. Migration 002 records pending/terminal backup history with event references and freshness.

**Tech stack:** Node 24+, node:sqlite backup, strict ESM TypeScript, node:test; native authenticated crypto only in the synthetic test hook.

**Spec:** docs/superpowers/specs/2026-10-27-backup-restore-design.md; MZ_IMPLEMENTATION_PLAN.md sections 5.3/MZ-005.

## Global constraints

- Keep migration 001 unchanged; every persistent change ships in migration 002.
- Never copy a live SQLite/WAL file directly or overwrite existing destination files.
- Private staging, no raw SQL handle to workers, source-safe errors and structural receipts only.
- No actual host key, off-host storage, scheduler, or production restore is provisioned.
- Hook acknowledgement is a trusted contract; local fixture encryption does not prove live off-host operation.

## Review focus

- Version-1 databases migrate without lost history and failed migrations preserve schema/data.
- Native snapshots handle WAL and close/concurrent operations safely, without overwrites or plaintext leftovers.
- Hook/receipt/audit failures cannot produce false backup success/freshness.
- Freshness handles no success, stale/future timestamps, later failures/pending attempts, and invalid policies.
- Fixture restoration verifies actual standalone data through Core, not merely file existence.

## Task 1: Durable backup metadata and native snapshots

Files: packages/state/migrations/002-backups.sql, state types/migrations/sqlite/integration helpers, tests/state*.test.mjs, tests/backups.test.mjs.

- [x] Reconcile issue 7, mark FR-005 In progress, and run baseline checks.
- [x] Write failing synthetic tests for backup records, freshness, integrity, native snapshots, and v1 upgrade.
- [x] Add migration 002 and typed read/control-plane integration operations; preserve append-only events.
- [x] Implement exclusive private snapshot creation, lifecycle guards, and rollback/failure handling.

## Task 2: Core external hook and fixture restore

Files: packages/core/src/backups.ts, shared private host-directory helper and secret-provider integration, tests/backups.test.mjs, tests/install.test.mjs.

- [x] Add failing tests for hook/receipt failures, audit/pending semantics, staging cleanup and real encrypted fixture restoration.
- [x] Implement Core orchestration and safe errors without a production cryptographic archive format.
- [x] Verify all previous secret-provider checks still pass after factoring shared directory checks.
- [x] Run full suite and clean-install Core export checks.

## Task 3: Runbook, review, and integration

Files: docs/backups.md, schemas/runtime-state-v2.md, README/AGENTS/architecture/workflow, FR-005 ticket and this ledger.

- [x] Document schema evolution, restore procedure, external tool contract, and live off-host/scheduling requirements separately.
- [x] Run check/typecheck/diff check, independent review, and regression fixes.
- [x] Prepare PR, verify CI, merge, sync issue/Project, verify main, then continue FR-006.

## Execution ledger

- Ruling: active all-ticket goal authorizes routine implementation; no actual production backup resources are needed to meet this ticket's explicit fixture/contract acceptance.
- Ruling: use an external encryption/storage hook rather than invent a production encrypted archive; the real crypto round trip is a synthetic test implementation only.
- Ruling: add a pending marker and backup FK in migration 002 so asynchronous external work cannot falsely claim audited success after a crash/closed state.
- Pre-flight: v1 state/migration assertions must be updated to v2 while retaining a real v1-upgrade fixture. Secret-provider permission tests must remain green after shared-host-helper extraction.

- Verification: full check/typecheck passed with 193 tests before final cleanup-failure test; targeted backup suite now 23 passed. Final full checks and independent review in progress. Freshness ages snapshot start conservatively and selects the newest successful start, preventing late-upload false freshness.

- Final local verification: check (194/194), typecheck, Markdown links, diff check; migration 001 unchanged. Independent review: no functional blockers; expanded v1 fixture to substantiate run/event history preservation.

- Integration: PR #20 merged as fb33555; both exact-head CI runs passed. Merged main check/typecheck passed (194 tests). FR-005 issue/Project synchronized Done. Next: FR-006.
