# MZ

MZ is a small MIT-licensed organization toolbox for humans and coding agents. It supplies identity, context, work references, and authority without replacing the worker.

## Current state

The CLI implements help, version, [environment doctor](docs/doctor.md), [private Markdown intake](docs/intake.md), [inbox inspection/triage](docs/inbox.md), [bounded context compilation](docs/context.md), and [status/advisory steward](docs/steward.md). Core provides a read-only [company repository loader](docs/company-repository.md) and [SQLite runtime state](docs/runtime-state.md) with migrations and atomic audit history. Core also provides [secret references and scoped host-file secret handling](docs/secrets.md). Core also provides the [backup hook and verified fixture restore contract](docs/backups.md). The [thin MZ worker skill](packages/skill/SKILL.md) teaches these interfaces; [verification and recording prerequisites](docs/worker-skill.md) are explicit. Core defines [neutral provider contracts](docs/providers.md); the GitHub package retains its audited offline generic skeleton and adds an organization-owned [GitHub App connection and pilot repository provisioning](docs/github-app.md). General worker scheduling and complete work/source integration remain future [milestones](docs/milestones.md). Context compilation remains offline. Owner-facing guide/ask conversations use Codex with saved installation settings. The explicit structured advisory form performs a bounded tool-free OpenAI request; live model use needs separately provisioned host configuration and authorization. The [real pilot](docs/pilot-handoff.md) is the next human boundary.

Use [getting started](docs/getting-started.md) for normal onboarding. The [test plan](docs/test-plan.md) is a maintainer fixture/regression walkthrough with expected results and optional live acceptance checks.

## First use

After the devbox installation, run `mz init`, then `mz guide`, then `mz ask`. Init prepares a company shell and remembers local settings; guide and ask use your existing Codex login for owner conversations. No company context questions need to be answered in the development chat. See the [short getting-started guide](docs/getting-started.md) and [scoped GitHub authentication](docs/github-setup.md).

## Local development

Requires Node.js 24+ and npm 11+.

```sh
npm ci
npm run build
npm run install:local
npm run mz -- --help
npm run mz -- --version
```

`npm ci` links the workspace executable. After building, `npm exec -- mz --help` also works. No company configuration, credentials, network access, or runtime store is required for help/version. Packages are private workspaces, not published npm releases.

```sh
npm test             # build and run subprocess tests using node:test
npm run typecheck    # check composite TypeScript projects
npm run lint         # ESLint
npm run format:check # Prettier checks
npm run format       # apply formatting
npm run check        # build, lint, formatting, and tests
```

Unsupported commands or additional arguments exit with status 2. Diagnostics never echo supplied arguments. No arguments, `help`, `-h`, and `--help` show help; `-v` and `--version` show the installed package version.

## Structure

- `packages/core`: company loading and the typed runtime-state boundary.
- `packages/cli`: command parsing and executable entry point.
- `packages/state`: SQLite adapter and bundled migrations.
- `packages/context`: context compiler, status and advisory steward orchestration.
- `packages/providers/github`: audited offline provider skeleton and bounded GitHub App client.
- `packages/skill`: thin worker skill and command/authority guidance.
- `templates/company`: generic manual scaffolding for a separate private company repository.
- `schemas`: versioned company configuration and migration instructions; `examples`: future runnable examples.
- `tests/*.test.mjs`: deterministic subprocess tests against built JavaScript.

See [architecture](docs/architecture.md), [contributing](CONTRIBUTING.md), and [ticket workflow](docs/workflow.md). Keep company configuration and credentials outside this public implementation repository.

## License and attribution

Copyright (c) 2026 [expeter](https://github.com/expeter). Licensed under the [MIT License](LICENSE), which requires retaining the copyright and permission notices in copies or substantial portions of the software.
