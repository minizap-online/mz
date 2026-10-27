# Contributing

Register work as BUG, FR, or CR in [the ticket workflow](docs/workflow.md) before implementation. Follow the current milestone; preserve original MZ task references. Tickets record acceptance and actual verification evidence.

Use Node.js 24+ and npm 11+. Run `npm ci`, then `npm run check`. Before submitting, apply `npm run format` if needed. Tests live in `tests/*.test.mjs` and use the Node test runner against built JavaScript. Add meaningful deterministic coverage for behavior changes; use synthetic fixtures without credentials or company data.

Use simple, strict ESM TypeScript. Core domain types must stay independent of GitHub and LLM vendors. Integrations belong behind provider interfaces. Formatting uses Prettier (two spaces, single quotes); lint uses ESLint and typescript-eslint.

Use concise imperative commit subjects referencing the ticket, for example `FR-001: bootstrap TypeScript workspace`. Pull requests explain the problem, resulting behavior, ticket, and validation. Record material design departures as a CR or ADR.

Never commit credential values, runtime databases, private company content, or generated builds. Every future schema change needs a migration; events must be append-only and runtime access must go through Core.
