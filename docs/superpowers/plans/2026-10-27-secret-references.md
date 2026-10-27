# Secret References Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver FR-004/MZ-004 with synthetic verification and no actual credential access.

**Architecture:** Core defines branded references, provider/value interfaces, opaque one-shot handles, safe redaction, and a restrictive allowlisted host-file adapter. Material never appears as a serializable object property.

**Tech stack:** Node 24+, ESM TypeScript, POSIX filesystem descriptors, node:test.

**Spec:** docs/superpowers/specs/2026-10-27-secret-references-design.md; MZ_IMPLEMENTATION_PLAN.md section 6 and MZ-004.

## Global constraints

- No real credential access, new persistent schema, actual mounts, vendor integration, or secret service.
- Only explicit allowlisted host files; restrictive POSIX ownership/permissions and bounded reads.
- Opaque handles/scoped values prohibit serialization; explicit primitive exposure is confined to trusted action code.
- Redaction covers known wrappers/material, not arbitrary unknown credentials or transformed copies.

## Review focus

- Permission/type checks occur on opened descriptors before reading; no ref-to-path traversal or symlink/hardlink exposure.
- Material never appears in wrapper properties, JSON, structured clones, coercion, inspection, or error messages/causes.
- Async action lifetime, reuse, concurrent dispose, and escaped scoped values cannot reveal disposed material.
- Redaction avoids getters/custom serialization and handles escaped values, keys, cycles, and expired handles safely.
- Existing Core state rejects wrapper values without serializing them; clean installation remains usable.

## Task 1: Reference/handle/redaction contract

Files: packages/core/src/secrets/{types,handles}.ts, packages/core/src/index.ts, tests/secrets.test.mjs.

- [x] Reconcile issue 6 and mark FR-004 In progress; run the current baseline suite.
- [x] Write failing synthetic tests for refs, opaque wrapper serialization/logging/lifetime, and redaction.
- [x] Implement the provider-neutral types and opaque handles with scoped explicit exposure.
- [x] Verify safe errors, buffer disposal, escaped value rejection, nested redaction, and state boundary compatibility.

## Task 2: Host-file provider and documentation

Files: packages/core/src/secrets/host-files.ts, docs/secrets.md, README.md, AGENTS.md, docs/{architecture,workflow}.md, docs/tickets/FR-004.md.

- [x] Add failing tests for host bindings, permissions, links, file bounds, and exact UTF-8 preservation.
- [x] Implement POSIX ownership/permission checks, safe descriptor reads, and source-safe failures.
- [x] Document host configuration, action lifetime, and primitive/redaction limits; no real host setup is performed.
- [ ] Run npm run check, typecheck, and diff check; record evidence and obtain independent review.
- [ ] Fix concrete findings with regression tests; prepare PR, verify CI, merge, sync issue/Project, and verify main.

## Execution ledger

- Ruling: owner requested all tickets in order, stopping only for a human requirement. Routine API choices are documented here and implementation continues without another approval round.
- Ruling: feature branch fr-004-secret-references in the existing clean checkout; no concurrent implementation requires another worktree.
- Ruling: reveal primitive text only through an opaque action-scoped value; JavaScript cannot prevent a malicious trusted callback copying that primitive, so document the boundary rather than claim universal serialization control.
- Pre-flight: no Core/state schema changes; public Core exports and clean-install tests must remain compatible.

- Baseline clean main a5e7b3a, issue 6 open in M-01; baseline suite 125/125. Initial 42/42 secret tests failed because the public API was absent.
- Task 1/2 implementation complete: opaque/scoped secret handling, redaction, host provider, docs and clean export checks. No persistent schema changed.
- RED→GREEN regressions: normalized symlink-root spelling, source-safe thrown error proxies, and unprotected writable ancestors. Safe error codes use private provenance rather than reading arbitrary thrown objects.
- Check/typecheck/diff check pass; full suite 171/171. Independent review pending.
