# Repository Guidelines

## Project Structure & Module Organization

This checkout contains MZ, the organization toolbox, with the M-00 bootstrap and M-01 company loading/runtime state. Read `MZ_IMPLEMENTATION_PLAN.md`, `docs/architecture.md`, and the active milestone before changes. Actual organization context belongs in the separate private company repository.

The TypeScript layout is `packages/{core,cli,context,state,skill}` plus `packages/providers/github/`. Shared schemas belong in `schemas/`, reusable scaffolding in `templates/`, documentation in `docs/`, and generic examples in `examples/`. The CLI implements only help/version. Core provides the read-only company repository loader (FR-002); state provides the SQLite adapter through Core, while context/provider packages are placeholders. Read `docs/company-repository.md` and `docs/runtime-state.md` before changing those formats. `docs/` contains ticket and milestone tracking. Keep private company configuration separate from reusable MZ implementation.

## Build, Test, and Development Commands

Read `docs/workflow.md`, `docs/tickets/README.md`, and the active milestone before implementation. Register work as BUG, FR, or CR before starting; keep status and actual verification evidence in the ticket file, and update it before ending a session. Preserve original MZ task references and link GitHub issues when provisioned. The actual GitHub organization is `minizap-online`: reusable implementation targets `minizap-online/mz`, and private company data targets `minizap-online/company`.

Requires Node.js 24+ and npm 11+. Use `npm ci`, `npm run build`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run check`. Run `npm run format` to apply formatting. After building, use `npm run mz -- --help` or `npm exec -- mz --version`.

Planned CLI examples include `mz doctor` for environment checks, `mz ingest idea.md` for intake, and `mz context` for bounded worker context. Treat these as target interfaces until implemented.

## Coding Style & Naming Conventions

Prefer simple, inspectable TypeScript and introduce frameworks only for concrete requirements. Keep domain types independent of GitHub and LLM vendors; isolate integrations behind provider interfaces.

Use strict ESM TypeScript, ESLint, and Prettier (two spaces, single quotes). Use descriptive names aligned with the design, such as `SecretProvider` and `SourceControlProvider`.

## Testing Guidelines

Tests in `tests/*.test.mjs` use the Node test runner against built JavaScript. No coverage threshold is configured. Add meaningful deterministic tests alongside behavior changes.

Prioritize deterministic context compilation without LLM calls, SQLite migrations and transactions, capability enforcement, secret redaction, and backup restoration. Use synthetic fixtures without credentials or private organization data.

## Commit & Pull Request Guidelines

Use concise, imperative subjects; reference implementation tickets where relevant, for example `MZ-003: add runtime state migrations`.

Pull requests should explain the problem, resulting behavior, related ticket, and validation performed. Record material departures from the design in an explicit decision or ADR.

## Security & Architecture Constraints

Never persist credential values in Git, SQLite, logs, fixtures, or examples; use symbolic secret references. Every schema change needs a migration. Events are append-only, provider actions must be auditable, and workers access runtime state through MZ Core. Keep work within the current milestone rather than implementing future features speculatively.
