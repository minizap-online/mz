# Markdown Intake Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver FR-008/MZ-008 with private untrusted Markdown intake and atomic structural history.

**Architecture:** Core retains bounded source copies outside Git, then commits structural intake metadata and inbox/event through the existing SQLite port. Migration 003 preserves earlier schema/data. CLI streams file/stdin under explicit host/company/actor settings.

**Tech stack:** Node 24+, strict ESM TypeScript, native filesystem/SQLite, node:test; no LLM/provider dependency.

**Spec:** docs/superpowers/specs/2026-10-27-markdown-intake-design.md; docs/intake-storage.md.

## Global constraints

- Stay in M-02; no automatic triage/promotion, project activation, remote actions, LLM, purging or deployment.
- Raw source stays in private host files outside Git; SQLite/events/output contain structural metadata and a fixed summary placeholder.
- Preserve migration 001/002 and old InboxItem shape; every durable schema change is migration 003.
- Cap exact UTF-8 input at 1 MiB; no NUL; do not execute or reinterpret document instructions.
- Only clean artifacts created/owned by the failing attempt; never mutate/delete original input.

## Review focus

- Partial metadata/event failure must roll back the inbox; owned raw artifacts must be cleaned without touching another attempt.
- Crash windows/filesystem-vs-SQL atomicity must be documented honestly, with durable sources before committed references.
- Invalid/oversize streams/files and malicious Markdown must not leak input or cause execution.
- Git/worktree/bare directory and permission/link boundaries must reject unsafe retention locations.
- Existing v2 histories, backups, doctor and help/version must survive the schema upgrade.

## Task 1: Structural intake metadata

Files: state migrations/003-intake.sql, intake-types.ts/records/sqlite/types/index, Core exports, tests/intake.test.mjs, version assertions in existing tests.

- [x] Reconcile FR-008; record retention/promotion policy and sync In progress.
- [x] Write failing intake metadata/atomicity/v2 preservation tests.
- [x] Add migration 003 and typed optional creation/read operations, preserving InboxItem compatibility.
- [x] Verify migrated history and prior state/backup/doctor behavior.

## Task 2: Private source and CLI ingestion

Files: Core intake.ts, CLI ingest.ts/cli.ts, tests/intake.test.mjs/intake-cli.test.mjs/install.test.mjs.

- [x] Write failing Core file/stream privacy, scope, limits, ownership/Git, failure cleanup and instruction-data tests.
- [x] Implement source-safe errors, exclusive durable private source writing and atomic inbox call.
- [x] Write failing real CLI file/stdin/environment/exit/privacy tests; implement strict parsing and existing store/company checks.
- [x] Full check/typecheck and clean install.

## Task 3: Documentation and integration

Files: schemas/runtime-state-v3.md, docs/intake.md/storage/architecture/runtime-state/README/AGENTS/workflow, ticket and ledger.

- [x] Document v3 upgrade, private source retention/recovery, CLI/API settings and limitations.
- [x] Independent review; fix findings and verify full checks/diff/links.
- [ ] PR, exact-head CI, merge, main verification, issue/Project Done. Continue FR-009 local inbox triage.

## Ledger

- Ruling: retain imported sources until explicit operator removal; automated retention/purge is outside this ticket. Actual deployment policy remains private and is not approved by a fixture implementation.
- Ruling: use a separate inbox_intake table to preserve existing structural InboxItem shape and records; no raw source text or names enter SQLite.
- Ruling: explicit existing runtime path avoids accidental initialization by ingest; Core applies supported upgrades only after operator selection.

- Verification: initial state red 8, Core red 20 and CLI red 17; all green. Added FIFO/write-failure cases. Full check passed 297 tests including prior state/migrations/backup/doctor and expanded clean install. Migration 001/002 unchanged. Independent review underway.
- Ruling: use one fixed stdin buffer rather than a chunk array so empty/tiny chunks cannot grow retained allocation without exceeding the byte limit.
- Ruling: read result metadata inside the creation transaction so a subsequent lookup failure cannot cause cleanup of a committed source reference.

- Independent review found an Important existing-runtime gap: a pre-created empty file was initialized by ingest. Red CLI regressions reproduced it; Core existingOnly now refuses missing/uninitialized/foreign files before WAL/migrations and still upgrades recognized v2 history. Reviewer independently reran all 51 intake tests and confirmed resolved, with no new findings.

- Final local check passed 301/301 tests, build/lint/format, typecheck/diff/local links. Existing migrations 001/002 unchanged. Ready for PR/CI.
