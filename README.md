# MZ

MZ is a small MIT-licensed organization toolbox for humans and coding agents. It supplies identity, context, work references, and authority without replacing the worker.

## Current state

The CLI currently implements help and version only. Core provides a read-only [company repository loader](docs/company-repository.md) and [SQLite runtime state](docs/runtime-state.md) with migrations and atomic audit history. Core also provides [secret references and scoped host-file secret handling](docs/secrets.md). Core also provides the [backup hook and verified fixture restore contract](docs/backups.md). Doctor, intake, context compilation, GitHub work/source providers, and the agent skill are planned in later [milestones](docs/milestones.md). Context and provider packages reserve future implementation boundaries.

## Local development

Requires Node.js 24+ and npm 11+.

```sh
npm ci
npm run build
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
- `packages/state`: SQLite adapter and bundled migrations; `packages/context` and `packages/providers/github`: future implementation boundaries.
- `packages/skill`: future thin worker skill.
- `templates/company`: generic manual scaffolding for a separate private company repository.
- `schemas`: versioned company configuration and migration instructions; `examples`: future runnable examples.
- `tests/*.test.mjs`: deterministic subprocess tests against built JavaScript.

See [architecture](docs/architecture.md), [contributing](CONTRIBUTING.md), and [ticket workflow](docs/workflow.md). Keep company configuration and credentials outside this public implementation repository.

## License and attribution

Copyright (c) 2026 [expeter](https://github.com/expeter). Licensed under the [MIT License](LICENSE), which requires retaining the copyright and permission notices in copies or substantial portions of the software.
