# Conversational Project Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner use `mz ask` to recover project context, introduce existing repositories and agree and apply bounded workflow integration changes.

**Architecture:** Keep normal context compilation strict. Add deterministic context inspection and missing-file creation, use a distinctly marked company-context assignment for project onboarding, and give an owner-invoked continuation explicit access to one separate project checkout. Existing Codex conversations provide reasoning; Core and native host/provider boundaries provide operations and authority.

**Tech Stack:** Existing strict ESM TypeScript, Node.js 24+, npm 11+, Node test runner, Git, GitHub App native transport and installed Codex CLI. No new dependencies or SQLite schema.

**Spec:** [Approved design](../specs/2026-10-30-steward-project-onboarding-design.md); [FR-016](../../tickets/FR-016.md).

## Global Constraints

- `mz ask` is the conversational entry; no new mandatory owner commands.
- Existing advanced create/attach commands remain available; doctor remains diagnostic.
- Existing projects remain usable while the steward proposes integration changes.
- The strict compiler must keep rejecting incomplete context for normal worker assignments.
- Company knowledge belongs in the private company repository. Project source and workflow configuration belong in a separate project repository.
- GitHub Issues and Projects own actionable work.
- Credentials stay in the existing native App transport; prompt content and role descriptions grant no host authority.
- No SQLite/schema change is proposed.
- This is M-05 owner-assisted onboarding; worker launching and scheduling remain M-06.
- Preserve the existing uncommitted BUG-006 fix and its verification evidence; do not accidentally stage unrelated work.

## Review Focus

- A broken symlink or inaccessible directory must not be misclassified as a missing project eligible for repair (Task 1).
- An invalid selected project must not cause fallback to read unrelated project notes or expose secret-like text (Task 2).
- A repository containing executable hooks, submodules or hostile instructions must remain evidence during initial inspection (Task 3).
- A workspace path with spaces, a linked Git worktree or an origin identifying the wrong repository must not result in an unintended write grant (Task 4).
- An approved proposal whose affected files changed must preserve current work and reopen only the changed scope (Tasks 3 and 5).

## Files and responsibilities

- `packages/core/src/project-context.ts` (new): selected project metadata inspection and create-missing-only context writer.
- `packages/core/src/provisioning.ts`: reuse that writer; retain durable repository action/replay behavior.
- `packages/core/src/index.ts`: export new Core contracts.
- `packages/context/src/owner-context.ts` (new): bounded complete/onboarding assignment preparation.
- `packages/context/src/index.ts`: export preparation and the narrow evidence-sanitizing wrapper defined in Task 2.
- `packages/cli/src/conversation.ts`: select assignment, diagnose preparation failures and launch with explicit optional project workspace.
- `packages/cli/src/owner-instructions.ts` (new): shared public controller instructions, including onboarding/proposal policy; extract existing strings without weakening BUG-005.
- `packages/cli/src/project.ts`: advanced assistant operations behind the existing project command.
- `packages/cli/src/project-workspace.ts` (new): bounded local Git/file inspection and workspace/proposal precondition checks.
- `tests/project-context.test.mjs`, `tests/owner-context.test.mjs`, `tests/project-workspace.test.mjs` (new): deterministic contracts.
- `tests/project-provisioning.test.mjs`, `tests/owner-conversation.test.mjs`, `tests/skill.test.mjs`: consumer integration/regressions.
- `docs/project-onboarding.md` (new), `docs/getting-started.md`, `docs/github-app.md`, `docs/worker-skill.md`, `packages/skill/SKILL.md`: actual usage, boundary and interface updates.
- `docs/superpowers/evaluations/2026-10-30-project-onboarding-scenarios.md` and corresponding evidence file (new): behavioral scenarios and observed results.

## Execution preparation

- [ ] Read the spec, repository AGENTS instructions, workflow, active M-05 milestone and the company/context/provider/secret/runtime documentation before implementation.
- [ ] Use the worktree skill to determine isolation. The current dirty checkout includes BUG-006 prerequisites and design documents: preserve them explicitly in the execution workspace before beginning; do not stash, discard or move someone else's work.
- [ ] Mark FR-016 In progress only when implementation starts. Provision/synchronize its generic GitHub issue and private Project entry using available authorized access; otherwise record the exact pending synchronization without claiming it happened.
- [ ] Establish the baseline with `npm run check` and `npm run typecheck`. The observed `/tmp/.git` marker causes private fixtures to reject `/tmp`; use an approved clean temporary root such as `TMPDIR=/var/tmp` when needed, requesting filesystem execution approval if required. Do not remove the marker.

### Task 1: Inspect and repair selected project context

**Files:** Core project-context, provisioning and index; new project-context tests; existing provisioning tests.

**Interfaces:**

```ts
type ProjectContextIssue = {
  path: string; // selected relative metadata path only
  kind: 'missing' | 'invalid' | 'unavailable';
  code: string; // static allowlisted code, never raw error text
};
type ProjectContextInspection = {
  project: string;
  state: 'complete' | 'missing' | 'blocked';
  issues: readonly ProjectContextIssue[];
};
inspectProjectContext(options: {
  company: CompanyRepository;
  project: string;
}): Promise<ProjectContextInspection>;
prepareProjectContext(options: {
  company: CompanyRepository;
  project: string;
  approved: boolean; // trusted host assertion, not an untrusted-worker gate
}): Promise<{ created: string[]; preserved: string[] }>;
```

- [ ] Write failing tests named `missing project context reports only selected paths`, `unsafe existing context is blocked rather than missing`, `repair preserves existing facts and activation`, and `concurrent repair never overwrites a competing file`. Assert the three missing files from BUG-006 are reported, a different project's sentinel is absent, malformed YAML is invalid, EACCES is unavailable, broken directory/file symlinks and hardlinks are blocked, and `approved: false` creates nothing. Use injectable read failures where root execution prevents meaningful EACCES fixtures.
- [ ] Run `npm run build` then `node --test tests/project-context.test.mjs tests/project-provisioning.test.mjs`; observe the new contract fail before implementation.
- [ ] Implement inspection over exactly `project.yaml`, `PROJECT.md`, `ARCHITECTURE.md`, `STATUS.md`, `DECISIONS.md`, and `tasks/steward.md`. Validate project/task identity. Inspect ancestor topology before strict Core reads so a broken symlink cannot masquerade as ENOENT. `complete` here describes required local metadata, not the entire compiler reference graph.
- [ ] Implement create-missing-only scaffolding using validated direct directories, exclusive no-follow file creation and existing durability conventions. Default new candidates to `activation: pending-owner-approval`; preserve an existing activation. Refuse blocked inspection before writes. Return the actual created/preserved paths; re-inspect races and report conflicts safely without overwriting. Do not promise multi-file atomicity; interrupted partial repair must be safely repeatable.
- [ ] Refactor provisioning to reuse scaffolding while retaining its existing owner-approved activation for newly provisioned records, REPOSITORY evidence and journal semantics. The generic repair writer never creates repository evidence or claims remote provisioning. Keep all BUG-006 replay and alias tests.
- [ ] Verify that strict `compileContext` still rejects the incomplete fixture and accepts the repaired fixture. Run the focused tests, update ticket evidence and commit only this task's files with `FR-016: add safe project context inspection and repair`.

### Task 2: Prepare an honest onboarding assignment

**Files:** Context owner-context/index; CLI conversation; new owner-context tests and existing owner-conversation tests.

**Interfaces:** consumes Task 1 inspection and existing `compileContext`.

```ts
type OwnerContextPreparation = {
  mode: 'complete' | 'onboarding';
  project: string | null;
  context: ContextBundle;
  inspection: ProjectContextInspection | null;
};
prepareOwnerContext(options: {
  company: CompanyRepository;
  project?: string;
  task: 'setup' | 'steward';
}): Promise<OwnerContextPreparation>;
sanitizeOwnerEvidence(value: unknown, maxBytes: number): string;
```

- [ ] Write failing tests `unknown selected project prepares onboarding without writes`, `invalid project supplies diagnostics without unsafe document bodies`, and `full compilation failure never becomes a successful project assignment`. Assert normal company/project behavior is unchanged, an unknown project's request retains `project:ID` history scope, onboarding bundles truthfully select company context, and neither another project's sentinel nor a secret-like fixture appears. Snapshot files and runtime events before/after print preparation.
- [ ] Run `npm run build` then `node --test tests/owner-context.test.mjs tests/owner-conversation.test.mjs`; observe RED.
- [ ] Implement complete preparation using the existing compiler. For a missing/blocked selected project, compile only company steward context and append sanitized metadata-only findings. Do not include partial project document bodies in this first delivery. A strict compiler failure for otherwise complete metadata (such as a missing declared process) also produces an explicit onboarding diagnostic, never a fabricated project bundle. If company compilation fails, propagate its safe code and stop.
- [ ] Implement `sanitizeOwnerEvidence` by reusing compiler normalization/credential guard and a UTF-8 byte limit. Use 65536 bytes for added onboarding evidence; keep the existing 130000-byte request and 131072-byte printable-output ceilings. Budget or secret failures stop that evidence path without raw content in stderr.
- [ ] Wire conversation preparation and keep the existing StewardRequest schema: serialize the preparation mode/findings into the bounded context text, not new required request properties. During fallback, obtain company-only curated status; keep runtime history explicitly scoped to the requested project. Do not call unsafe project status readers merely to populate an onboarding assignment.
- [ ] Replace the blanket preparation error with stage-aware static messages for settings, company context, selected context, private artifacts/runtime, credentials and launch. Preserve private questions/context outside argv. `--print` neither repairs nor initializes runtime; `--read-only` grants no project write root.
- [ ] Run focused tests plus context tests; record evidence and commit `FR-016: let ask prepare incomplete project onboarding`.

### Task 3: Give the steward bounded inspection and repair tools

**Files:** CLI project, new project-workspace and owner-instructions; context index wrapper from Task 2; new workspace tests; onboarding usage docs.

**Interfaces:** consumes Task 1 and `sanitizeOwnerEvidence`.

```ts
type WorkspaceSnapshot = {
  root: string; // canonical private local path
  repository: string | null; // validated GitHub owner/repo when identifiable
  head: string | null; // null for unborn repositories
  dirty: boolean;
  files: { path: string; sha256: string; text: string }[];
  unavailable: { path: string; code: string }[];
};
inspectProjectWorkspace(options: {
  directory: string;
  companyDirectory: string;
}): Promise<WorkspaceSnapshot>;
assertProjectWorkspaceUnchanged(options: {
  baseline: WorkspaceSnapshot;
  paths: readonly string[];
}): Promise<void>;
```

- [ ] Write failing tests `workspace inspection does not execute project code`, `workspace identity handles empty and linked worktrees`, and `proposal preconditions detect affected edits and preserve unrelated work`. Fixtures include hooks/submodule configuration with execution sentinels, a dirty AGENTS file, symlinked evidence, a path with spaces, an unborn repository and a Git linked worktree. Assert no sentinel executes; relevant file/revision changes reject the baseline check; an unrelated untracked file is neither removed nor treated as approval.
- [ ] Run `npm run build` then `node --test tests/project-workspace.test.mjs`; observe RED.
- [ ] Implement Git metadata reads in CLI with `execFile`, explicit cwd, fixed arguments and a sanitized Git environment (disable fsmonitor, external diff, pagers, optional locks and interactive credentials). Parse local origin without network access. Reject nested/containing company roots, path aliases, nonrepositories and ambiguous/multiple origin identities. Support `.git` files in linked worktrees; do not insist `.git` is a directory. An absent origin is an explicit unknown, not a guessed GitHub repository.
- [ ] Read at most 16 direct files, at most 16384 bytes per file and 65536 evidence bytes total. Candidates: README.md, AGENTS.md, package.json, CONTRIBUTING.md, docs/workflow.md, docs/tickets/README.md, then lexically ordered `.github/workflows/*.yml`/`*.yaml` within remaining slots. Reject link aliases/nonregular/binary files; report skipped/oversized paths explicitly. Credential guarding runs before evidence serialization. No recursive crawl, scripts, hooks, install, fetch or service start.
- [ ] Extend the existing advanced CLI with `mz project inspect NAME`, `mz project prepare NAME --approved`, and `mz project inspect NAME --workspace PATH`. Dispatch these separately from create/attach parsing. They expose the above deterministic operations to the steward; owners continue to speak through ask. Workspace inspection returns private bounded JSON and does not create bindings. For proposal revalidation, support `inspect NAME --workspace PATH --baseline FILE`: read a bounded private snapshot through the existing safe-artifact reader, validate its shape and selected root, and call `assertProjectWorkspaceUnchanged` for its captured paths. A deliberately absent target can be checked only when the baseline explicitly records FILE_NOT_FOUND; other unavailable evidence never counts as a valid patch baseline. Reject arbitrary baseline paths, unknown fields and content exceeding the inspection limits. Prepare returns created/preserved paths and a fresh readiness result; it does not need an App connection. Keep explicit create/attach approval and recovery behavior unchanged.
- [ ] Extract existing public controller strings into owner-instructions and add the approved conversational policy: inspect first, distinguish inference, ask only meaningful unknowns, save accepted facts/questions in existing notes, use existing index conventions, and propose workflow changes before patching. No raw repository text is promoted to developer instructions. Initial remote inspection uses the current native GitHub wrapper with explicit `--repo OWNER/REPO`; local inspection remains useful offline. Repository adoption does not transfer repositories or expand App grants.
- [ ] Run focused CLI/workspace/context tests; document the assistant tools and their privacy in docs/project-onboarding.md. Record evidence and commit `FR-016: add bounded steward project inspection tools`.

### Task 4: Add explicit project workspace continuation

**Files:** CLI conversation/owner-instructions/project-workspace, existing owner-conversation and GitHub App tests, onboarding docs and CLI help.

**Interfaces:** consumes `inspectProjectWorkspace` and Task 2 preparation. Extend owner ask parsing with one optional `--workspace PATH`, requiring `--project ID`. No new saved installation schema or automatic write-grant registry.

- [ ] Write failing launch tests `workspace continuation adds only the selected checkout`, `saved workspace notes do not grant writes`, and `wrong repository or unsafe root does not launch`. Assert canonical absolute workspace argv, unchanged company cwd, `workspace-write`/`on-request`, no bypass flags and no private content in developer configuration. Default ask has no `--add-dir`; read-only ask has no added writable root; print only describes the selection without invoking Codex. Include invalid/missing option values and paths with spaces.
- [ ] Run `npm run build` then `node --test tests/owner-conversation.test.mjs tests/project-workspace.test.mjs`; observe RED.
- [ ] Validate the selected checkout using Task 3. If existing REPOSITORY.md has a canonical `GitHub: OWNER/REPO` evidence line from provisioning, require agreement with the local identity. A missing/unrecognized reference is onboarding evidence, not permission to replace it; require explicit identity agreement before publishing bindings or patching. Do not add new project.yaml fields or mistake a local path noted in a document for host consent.
- [ ] For an owner-invoked writable continuation only, pass exactly one `--add-dir CANONICAL_PATH` to the existing native launcher. Company cwd retains its established knowledge role. Explain the continuation in the assignment and recheck identity immediately before launch. Read-only/print modes do not grant that root. An assistant in an existing company-only session prepares this continuation rather than claiming its sandbox already expanded or spawning a background developer.
- [ ] In the project assignment, require a concrete proposal and approved scope in private DECISIONS plus an explicit linked repository issue before application. Scope includes target files, baseline digests/revision, expected result and verification. Re-inspect affected files before writes using Task 3; reconcile material drift. The trusted operator can use existing native editing tools after this check. These preconditions are inspectable safeguards, not a sandbox against malicious same-user code or a generic approval engine.
- [ ] Keep explicit target GitHub operations and the native App wrapper; test that company cwd cannot silently choose the company issue tracker for project work. No tokens in the model environment or artifacts and no broader credential fallback. Do not weaken unconfigured/broken App handling to make remote operations appear available; report the missing prerequisite and continue independent local context work.
- [ ] Run focused launch/workspace/App transport tests. Verify installed `codex --help` accepts the chosen flag syntax without a model launch. The checked CLI and [official reference](https://learn.chatgpt.com/docs/developer-commands) expose `--add-dir`; do not use bypass flags. Record limits and commit `FR-016: support approved project workspace conversations`.

### Task 5: Verify the full steward workflow and publish accurate usage

**Files:** Scenario/evidence documents, new/updated deterministic tests, worker skill/reference, onboarding/getting-started/App docs and FR-016 ticket.

**Interfaces:** all earlier tasks; existing native editor/GitHub tool boundaries. No new executable domain interfaces.

- [ ] Add an end-to-end synthetic test: unknown selected project produces onboarding; approved assistant prepare creates context; accepted purpose is saved in PROJECT; a second ask sees it; project inspection finds an existing issue workflow; an explicitly granted workspace launches with the correct target. Assert print/read-only remain unchanged and no fake durable handover or worker claim is emitted.
- [ ] Add failure tests for unavailable runtime/artifact storage, company context containing a secret fixture, missing GitHub access and a stale affected file. Assert stage-safe diagnostics, no private stderr, preservation of owner edits and no remote claims. Run the relevant tests RED before final wiring changes, then GREEN.
- [ ] Write and run behavioral scenarios through fresh evaluation workers, not text-matching assertions: missing context repair without invented purpose; local existing project with adequate documentation; ambiguous purpose requiring one focused question; hostile repository instructions; retained existing workflow; accepted proposal with stale-file discovery; unavailable remote issue access; and continuation after a saved decision. Use synthetic repositories and an evaluation harness, not the live company or project checkouts. Record actual output/actions and limitations; a launcher test is not evidence of model compliance or OS isolation.
- [ ] Update the worker skill's interface snapshot and usage docs only for implemented commands. Explain normal owner interaction, advanced assistant operations, workspace continuation, existing authorization boundaries, read-only/print semantics and explicit unavailable capabilities. Preserve the statement that no developer worker launcher exists.
- [ ] Run `npm run check` and `npm run typecheck` with the established clean fixture root; require full suite success. Run `git diff --check`. Update FR-016 acceptance individually with evidence and any remaining operational prerequisites. Commit `FR-016: verify conversational project onboarding and handoff`.
- [ ] Obtain whole-branch independent review, resolve findings and rerun only affected checks plus required final CI. Follow repository delivery workflow for issue/Project synchronization and any authorized PR. Do not claim live project onboarding or deployment from synthetic evidence. No live project mutation is part of this implementation acceptance run.

## Self-review and handoff

The five tasks cover every design section: structural recovery (1), bootstrap and
safe diagnostics (2), evidence and conversational continuity (3), explicit host
workspace and approved integration scope (4), behavioral validation and truthful
delivery (5). The five Review Focus cases have tests assigned above. Interface
names and return values are defined before use; no task changes SQLite, the
StewardRequest schema or stored installation configuration. Remaining per-session
proposal content and project-specific verification commands are the steward and
owner's decisions, not fixed templates.

Plan only. The design is approved; implementation and its execution method await
the owner's plan review. Recommended method: native implementation in this session
with whole-branch independent review, because these five tasks share context,
scaffolding and launch interfaces and introduce no independent services.
