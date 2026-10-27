# Context Compiler Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver FR-010/MZ-010 deterministic, bounded, relevant company context.

**Architecture:** @mz/context consumes the existing Core company repository port, follows explicit source references and produces a normalized traceable bundle. CLI loads company context and emits only a fully validated result. Shared Core credential heuristics remain additional guards, not secret resolution.

**Tech stack:** Strict ESM TypeScript, Node crypto, existing YAML/Markdown Core loader, node:test; no network/model dependencies.

**Spec:** docs/superpowers/specs/2026-10-27-context-compiler-design.md.

## Global constraints

- Stay in M-03; no worker launch, provider action, runtime writes, raw intake loading or authority changes.
- Read only explicitly selected source graph; cap64 sources,32 refs per declared list, default65536/max1048576 output bytes.
- Deterministic captured normalized content, no timestamps/random IDs/root paths. Trace relative sources/digests accurately.
- Never silently drop/truncate required context; failures emit no partial body or caught details.
- Keep credentials out of curated sources/output; preserve symbolic refs without resolving them.

## Review focus

- Cross-project/process/path injection and mismatched identities must fail before unrelated content enters output.
- JSON framing/manifest/metadata and reference/source count must not bypass output budgets.
- Source metadata/getters/errors must not execute via normalization or leak on failure.
- Stable output must reflect captured contents without claiming raw-file/Git snapshot provenance.
- Missing required authority/policy/task material must fail, and compilation must not grant authority.

## Task 1: Compiler and source guards

Files: packages/context/src/compiler.ts/index.ts/types.ts, context package/tsconfig, Core secret checks/doctor/index, tests/context.test.mjs.

- [x] Register/reconcile FR-010 and sync In progress.
- [x] Add failing selection/isolation/determinism/digest/bounds/credential/safe error tests.
- [x] Implement explicit source graph and canonical capture/rendering/budgets.
- [x] Factor shared credential pattern guard and verify existing doctor/secret behavior.

## Task 2: CLI and installation

Files: CLI context.ts/cli.ts, CLI package/tsconfig/lock, tests/context-cli.test.mjs/install.test.mjs, synthetic fixtures.

- [x] Write failing real CLI text/JSON/strict args/no partial body tests.
- [x] Implement role/project/task selection and safe output/exit codes.
- [x] Verify clean installed entry point and full check/typecheck.

## Task 3: Docs/review/integration

Files: docs/context.md, templates/company role/task/project metadata examples, README/AGENTS/architecture/workflow, FR-010 ticket/ledger.

- [x] Document captured source graph, required files, bounds/traceability/credential/private output limits and informational authority.
- [x] Independent review; fix findings and run final check/typecheck/links/diff.
- [ ] PR/CI/merge/main verification, issue/Project Done; continue FR-011 thin skill.

## Ledger

- Ruling: use explicit per-document references, always-required authority/security baseline, and no directory scan or model summarization.
- Ruling: context overflow is an error, not silent truncation, so required policy content cannot disappear.
- Ruling: normalized hashes trace captured contents; no false claim of raw file hashes or an atomic working-tree/Git snapshot.

- Ruling: optional strict Core reads reject source aliases/multiple links; default loader link semantics stay unchanged. Red symlink/hardlink isolation tests and source-count preflight tests drove the change.
- Review: two Important findings (CR-only front matter lost declarations; mapping keys bypassed guards) reproduced with red regressions. Core optional normalization now occurs before parsing, preserving default behavior; keys reject controls/obvious credential patterns without rewriting/collisions. Reviewer confirmed both fixed, independently passed97 focused tests, no new findings.

- Final local verification: check371, typecheck/diff/links passed; generic template smoke12 sources/3852 text bytes. Core company schema and SQLite migrations unchanged. Compiler20/CLI12 tests plus installed workflow passed. Ready for PR/CI.
