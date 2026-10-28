# Guided onboarding implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement inline with one independent final review.

**Goal:** Install a usable init → guide → ask path on the devbox while leaving real onboarding answers to the owner inside MZ.

**Architecture:** Core local settings/initialization, CLI saved defaults and technical wizard, bounded private conversation preparation, interactive trusted Codex launcher, development installer. Existing structured API ask remains intact.

**Tech stack:** Existing Node24/npm11/strict ESM TypeScript/Core SQLite and native child_process/readline/filesystem. No new framework/dependency/schema migration.

**Spec:** docs/superpowers/specs/2026-10-28-guided-onboarding-design.md.

## Constraints

- No owner context questions or fabricated company/project facts in this chat.
- No secret values, raw state access by workers, silent overwrites, automatic activation, new default paid model or live model fixture.
- Config schema1; bounded UTF8 and strict identities/paths; private directories0700/files0600 outside Git for runtime/config.
- Preserve existing API ask and CLI flag > environment > settings precedence; no process.env mutation.
- Interactive Codex is a trusted operator, not the advisory interface; use workspace-write/on-request, fixed argv and private context file.

## Tasks

1. [x] Failing Core/settings/init tests; implement private validated config and no-overwrite shell/runtime creation; compile both company setup/steward tasks.
2. [x] Failing CLI/defaults/wizard tests; implement init, safe Git attach/clone, Codex check and stored configuration precedence with no help side effects.
3. [x] Failing interactive launch/guide/ask tests with synthetic Codex; implement bounded assignment files, inherited terminal sessions and honest run outcomes; preserve structured API form.
4. [ ] Installer and first-use documentation, saved-default intake simplification, test-plan/skill interface accuracy, full checks and independent review.
5. [ ] PR/CI/merge/install smoke from outside checkout, ticket/Project evidence; hand over three commands without running real onboarding for the owner.

## Review focus

- Interrupted/partial init and changed existing destinations: no overwritten owner files or silently replaced bindings.
- Saved configuration from another company/environment, unknown keys/links, invalid paths: no fall-through or broad scope.
- Terminal shutdown, absent Codex/login and child signals: honest lifecycle/status without leaked output or invented handover.
- Existing knowledge/config and process args: do not leak questions/credentials or treat context prose as a grant.
- Existing explicit API/CLI forms and readonly commands remain compatible.

## Ledger

- Ruling: user explicitly selected init over manual Codex bootstrap and deferred onboarding questions to the tool; implement that selected approach without asking them to repeat the decision here. The written design records implementation choices; no real org answers/activation are inferred.
- Ruling: guide and conversational ask use interactive Codex as trusted operator, with the old API advisory form retained. A Codex operator can read host-visible data and is not advertised as a tool-free isolated worker; company knowledge and session exit evidence are not fabricated structured handovers.

- Tasks1–3 verified: new settings/init/remembered defaults/owner conversations/provider sign-in tests passed; old API form preserved with setup-free --api-help. npm run check:418/418, build/lint/format and typecheck passed. Installer synthetic-prefix tests passed from another cwd without overwriting an unrelated mz command.
- Ruling: interactive provider-owned GitHub/Codex login belongs to technical init when needed, while --yes never initiates login — no credential values are collected or copied. OAuth/login acceptance remains with the actual owner inside the invoked provider UI.
- Shell wizard PTY smoke is running against an isolated synthetic company with a fake already-authenticated Codex; no real onboarding answers are populated.

- Real PTY wizard/default traversal plus guide --print completed in an isolated synthetic workspace; no real company context was collected. Additional config-within-company regression observed RED/GREEN. Full check now419/419, typecheck passed; local docs links/skill validator passed. Preparing the one independent final review.
