# Company control boundary implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this bounded fix inline.

**Goal:** Keep guide/ask responsible for company control and route delivery to separate project repositories.
**Architecture:** A shared public controller policy is passed directly as Codex developer instructions and copied into the bounded assignment. Existing company knowledge edits and project provisioning remain available. No worker engine or schema changes.
**Tech Stack:** TypeScript ESM, Node 24+, Node test runner.
**Spec:** [BUG-005](../../tickets/BUG-005.md), [architecture](../../architecture.md).

## Global constraints

Preserve private company files and active processes. Never put private assignment data in argv. Keep current trusted-host approvals and read-only behavior. Do not claim hard filesystem isolation or automatic workers.

## Review focus

Guide/ask must both receive controller instructions; print must expose the same policy; mode-specific instructions must survive; read-only must remain read-only; private questions must remain outside argv. Launcher tests exercise these five paths with synthetic fixtures, not a live model.

## Task 1: Controller launch and documented responsibility

Files: packages/cli/src/conversation.ts, tests/owner-conversation.test.mjs, docs/getting-started.md, docs/tickets/BUG-005.md.
Interface: runOwnerConversation retains its current signature and private StewardRequest schema.

- [x] Extend launcher tests for guide and ask, developer configuration, printable policy, read-only and private argv.
- [x] Run build and focused tests; observe missing configuration failures.
- [x] Add shared policy and mode-specific developer instructions using the documented Codex config override; retain private assignment content and existing sandbox defaults.
- [x] Document project ownership and missing worker execution; run focused tests, full check and typecheck.
- [x] Record evidence, obtain one fresh branch review, and deliver through the existing authorized PR/CI workflow.
