# Runtime State Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete FR-003/MZ-003 within M-01.

**Architecture:** Core exposes typed synchronous runtime operations; state owns SQLite, bundled immutable SQL migrations, and structural input validation. No raw SQL handle reaches workers.

**Tech stack:** Node 24+, node:sqlite, strict ESM TypeScript, node:test.

**Spec:** docs/superpowers/specs/2026-10-27-runtime-state-design.md; MZ_IMPLEMENTATION_PLAN.md sections 5.2, 18, MZ-003; CR-002 work authority.

## Global constraints

- Structural identifiers/timestamps/enums only; no arbitrary payloads, credential values, task status, or raw intake text.
- Events append-only, entity changes audited atomically, all schema changes migrated.
- Explicit absolute database file; no production data, provider calls, secret resolution, backups, doctor, or intake functionality.
- Transactions are synchronous, scoped, nonnested, and roll back on any operation failure.

## Review focus

- Migration identity/checksum/version checks reject unrecognized or damaged databases and preserve data on failure.
- UPDATE, DELETE, and REPLACE cannot erase audit history, including from another connection.
- Async/escaped transaction objects, swallowed failures, and contention cannot commit partial work.
- Unknown fields, unsafe identifiers, dates, and callback/driver errors cannot serialize or expose source values.
- Clean installation resolves Core/state workspace references and bundled SQL from unrelated cwd.

## Task 1: Migrations and structural record operations

Files: packages/state/migrations/001-runtime.sql, packages/state/src/{types,records,migrations,sqlite,index}.ts, packages/core/src/runtime.ts and index.ts, package/tsconfig metadata, tests/state.test.mjs.

- [x] Reconcile issue 5, mark FR-003 In progress, and run the baseline suite.
- [x] Add synthetic integration tests; run against absent Core export and confirm failure.
- [x] Implement driver-independent types, validation, immutable SQL migration/ledger, and typed adapter/Core entry point.
- [x] Verify atomic schema initialization/upgrades, persistent CRUD/audit pairs, WAL, and append-only SQL constraints.

## Task 2: Transaction lifecycle and failure boundaries

Files: state adapter/validation and tests/state.test.mjs; tests/state-migrations.test.mjs.

- [x] Add failing tests for atomic rollback, caught-operation poisoning, async/nested/expired transactions, and concurrency.
- [x] Implement safe scoped transaction lifecycle and sanitized errors.
- [x] Verify migration rollback, foreign/future/modified schema rejection, structural input rejection, and no synthetic credential marker persisted.
- [x] Run npm test; all tests must pass, including company/CLI/clean install.

## Task 3: Documentation and integration

Files: docs/runtime-state.md, schemas/runtime-state-v1.md, README.md, AGENTS.md, docs/architecture.md, docs/workflow.md, docs/tickets/FR-003.md, tests/install.test.mjs.

- [ ] Document API, schema/migration rules, source-of-truth/privacy limits, and the embedded control-plane boundary.
- [ ] Exercise Core runtime state from a clean installation and unrelated cwd.
- [ ] Run npm run check, npm run typecheck, and git diff --check; record actual evidence.
- [ ] Obtain one independent review; fix concrete findings using regression tests.
- [ ] Prepare PR, verify CI, merge, sync issue/Project status, and verify main.

## Execution ledger

- Ruling: owner authorized FR-003 by “go ahead”; routine API/schema decisions are documented here and do not require another approval round.
- Ruling: use feature branch fr-003-runtime-state in the clean existing checkout, matching FR-002; no concurrent implementation requires a worktree.
- Ruling: SQL migrations belong to the adapter package for cwd-independent bundling; schemas/ documents their shared contract. No SQLite ORM or native npm addon is needed.
- Ruling: exclude arbitrary event payload/raw intake text from the initial schema until FR-004 defines secret handling and M-02 defines private intake. Store structural references now rather than pretend to detect every possible credential string.
- Pre-flight: Core depends on state workspace types/factory; state never depends on Core. Add project references in that direction and test clean exports/migration assets.

- Baseline: npm test 78/78 on cb5b381; issue 5 reconciled/open in M-01. Initial state test run 34/34 failed because Core state API did not exist.
- Task 1/2 complete: initial migrations and records, WAL and append-only constraints, scoped transactions and failure boundaries implemented.
- Regressions RED→GREEN: drifted schema before upgrade, callback/initialization error traps, and false SQLite internal-name classification. Corrected LIKE underscore wildcard to a literal-prefix GLOB.
- Task 3 docs/clean-install verification complete: check/typecheck/diff check pass, 123/123 tests. Clean install exercises Core/state package dependency and bundled SQL from unrelated cwd. Independent review pending.
