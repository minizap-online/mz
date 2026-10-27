# Company Repository Loader Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver FR-002 without other M-01 capabilities.

**Architecture:** Core exports a read-only company repository API; filesystem access and strict metadata parsing are separate modules. The marker has an initial versioned JSON schema.

**Tech Stack:** Node.js 24+, strict ESM TypeScript, yaml, node:test.

**Spec:** docs/superpowers/specs/2026-10-27-company-loader-design.md; MZ_IMPLEMENTATION_PLAN.md MZ-002.

## Global constraints

- No company-specific constants, credentials, runtime state, new CLI command, or provider integration.
- Preserve Markdown body; errors omit source text and values.
- 1 MiB files, 32-level metadata limit, YAML 1.2 and JSON-compatible mappings.
- Tests use temporary synthetic fixtures, never the private company checkout.

## Review focus

- Invalid explicit paths/nearest markers must fail rather than select another company.
- Symlink and lexical escapes, non-regular files, oversized documents must fail before returning content.
- YAML warnings, parser errors, and unknown config keys must not leak private source values.
- Markdown delimiters, line endings, BOM, and body horizontal rules must preserve content correctly.
- API must remain usable after clean npm ci/build, and CLI help must stay independent of configuration.

## Task 1: Read-only loader and metadata contract

Files: packages/core/src/company/{types,metadata,repository}.ts, packages/core/src/index.ts, packages/core/{package,tsconfig}.json, package-lock.json, tests/company.test.mjs.

Interfaces: `loadCompanyRepository(options?)` returns canonical root, version-1 config, `readYaml(path)` mapping, and `readMarkdown(path)` metadata/body. `CompanyRepositoryError` exposes code/path and optional field/line/column.

- [x] Mark FR-002 In progress and reconcile/sync its GitHub issue.
- [x] Write synthetic integration tests for the specified successful and failing cases.
- [x] Run `node --test tests/company.test.mjs`; expect failures because the API is absent.
- [x] Install yaml in @mz/core and enable explicit Node types for filesystem adapter.
- [x] Implement types, parsing, discovery, validation, and contained file reads.
- [x] Run `npm test`; expect all tests green, including CLI and clean installation.

## Task 2: Schema, starter, documentation, and review

Files: schemas/company-v1.schema.json, schemas/migrations/001-company-config.md, templates/company/{company.yaml,README.md}, docs/company-repository.md, README.md, AGENTS.md, docs/{workflow,milestones}.md, docs/tickets/FR-002.md.

- [x] Publish initial schema and manual scaffold migration contract; do not add a database migration.
- [x] Document exact precedence/API/errors, examples, privacy boundaries, and versioning.
- [x] Add tests that load the shipped generic starter, verify read-only behavior, and exercise all schema constraints.
- [x] Run `npm run check` and `npm run typecheck`; expect exit 0.
- [x] Request one independent review of the complete branch; fix important findings with regression tests.
- [x] Record evidence, sync issue/Project, commit, and prepare the authorized change for review.

## Execution ledger

- Baseline: clean main at 449bd47; `npm test` passes 13/13. GitHub issue 4 is open in M-01 and matches the local acceptance criteria.
- Ruling: use branch fr-002-company-loader in the existing clean checkout rather than create a worktree; no concurrent implementation needs a second checkout.
- Ruling: the owner's “sounds good go ahead” authorizes implementation of FR-002 and routine loader/format decisions. Document those decisions and continue without another approval round.
- Ruling: this is the first parsed company schema; document migration from manual scaffolding without inventing prior runtime or database migrations.
- Pre-flight: Task 2 examples/schema must match Task 1 discovery and parser exactly; shipped-starter tests verify the boundary.

- Task 1 RED: 55 loader tests failed because the API was absent. Installed yaml 2.9.1 and implemented the loader. First suite found one failure: yaml suppresses multi-document errors with logLevel silent. Inspected parser source, changed to error, and retained the multi-document regression; parseDocument emits no source diagnostics.

- Task 1 complete: API, discovery, structured errors, contained bounded reads, and strict parsing verified by npm test. Task 2 starter/schema/docs implemented.
- Task 2 RED→GREEN: shipped-starter test failed CONFIG_NOT_FOUND before adding marker; Unicode-length regression failed before switching to code-point counting to match JSON Schema. Full npm run check and typecheck now pass, 74/74 tests.

- Independent review: no Critical findings; one Important delimiter-boundary bug and one Minor double-BOM content-preservation bug. Added regressions that failed in all four cases.
- Final Ruling: fix both document fidelity findings together in one pass: the small BOM issue is directly within the promised body-preservation contract, and leaving reproducible content loss would violate that contract. No deferred findings.

- Final fixed: Unicode/bare-CR front matter delimiter regression RED→GREEN; double-BOM preservation regression RED→GREEN. Full suite 78/78, check/typecheck pass.
- Task 2 complete: schema, starter migration, public API documentation, independent review and fixes complete. PR #17 prepared; GitHub CI must be green before merge.
