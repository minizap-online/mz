# Inbox Triage Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver FR-009/MZ-009 and complete M-02's implemented intake/inbox workflow.

**Architecture:** Core exposes bounded structural views and serialized partial triage patches; migration 004 pairs immutable snapshot history with events. Specialized read-only functions share diagnostic database validation for CLI reads. CLI never opens SQLite directly.

**Tech stack:** Strict ESM TypeScript, node:sqlite, Node test runner; no model/provider/remote calls.

**Spec:** docs/superpowers/specs/2026-10-27-inbox-triage-design.md.

## Global constraints

- Stay in M-02; private triage is not a GitHub work queue, promotion, activation or capability grant.
- Preserve raw source privacy and original intake metadata/InboxItem shape; migrations001–003 immutable.
- Every actual change/history/event commits together; events/history append-only and no-op adds nothing.
- Views/history are bounded (default100, max1000), explicit validated identifiers/enums only.
- CLI reads do not create/migrate stores; mutations require existing recognized state/actor.

## Review focus

- History/event insertion failure must leave neither partial record nor changed view.
- Concurrent partial patches must preserve unrelated fields, revision and audit identity.
- Legacy metadata absence must not hide rows or grant implicit classification/authority.
- Read-only views must not mutate/init/upgrade state or expose raw source names/content.
- Invalid options, before-receipt/previous timestamps and lifecycle/cursor errors must be safe.

## Task 1: Durable triage and bounded views

Files: state migrations/004, inbox-types.ts/inbox.ts, types/records/sqlite/exports, tests/inbox-state.test.mjs and version fixtures.

- [x] Register/reconcile FR-009 and sync In progress.
- [x] Write failing state view/pagination/patch/history/rollback/upgrade tests.
- [x] Implement migration004 and typed state/transaction methods.
- [x] Preserve original intake/source metadata and prior backup/doctor/state behavior.

## Task 2: Read-only views and CLI

Files: state inspection.ts/inbox-reader.ts, Core exports, CLI inbox.ts/cli.ts, tests/inbox-cli.test.mjs/install.test.mjs.

- [x] Write failing Core read-only and real CLI tests, including malformed/missing/old state and no disclosure.
- [x] Extract shared verified read transaction and implement specialized Core inbox reads.
- [x] Implement strict operation-specific CLI, actor/cursor/enums, text/JSON and safe exits.
- [x] Full check/typecheck and installed workflow from an unrelated directory.

## Task 3: Documentation and integration

Files: docs/inbox.md, schemas/runtime-state-v4.md, README/AGENTS/runtime/workflow/milestones/ticket/ledger.

- [x] Document local review semantics, read/mutation boundaries, source inspection and history/recovery limitations.
- [x] Independent review, regression fixes, final check/typecheck/diff/links.
- [ ] PR/CI/merge/main verification, issue/Project Done; audit M-02 exit before FR-010.

## Ledger

- Ruling: classification is a bounded local enum, scope is metadata and triaged is a review marker. No external work status, publication or activation is inferred.
- Ruling: retain original intake scope and record each effective triage snapshot append-only rather than update source provenance.
- Ruling: specialized current-schema read functions preserve diagnostic-grade no-init/no-migration behavior for list/inspect/history without exposing a raw connection or adding a general writable port to readers.

- Verification: red state15/read5/CLI18 before API implementation; all green. Final check339, typecheck/diff/local links passed. Existing migrations001–003 unchanged. Strengthened v3 preservation and encrypted snapshot restore to compare actual triage history.
- Independent review: no findings; reviewer passed 43 inbox/migration/install tests. No production/private data or remote action used.
