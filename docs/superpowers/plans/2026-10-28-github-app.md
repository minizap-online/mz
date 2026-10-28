# GitHub App connection and pilot provisioning implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline. Execute all tasks; one fresh whole-branch review at the end.

**Goal:** Connect an organization-owned GitHub App through MZ and create/attach the website repository without repeated personal-token setup or authority over the human owner.

**Architecture:** Core provides private versioned provisioning journals. The GitHub provider validates the exact App permission envelope, verifies owner/install identity, signs JWTs and mints operation-scoped tokens. CLI hosts a loopback manifest setup flow, protected import, App-aware Git credential helper and project API; trusted steward sessions invoke those commands.

**Tech Stack:** Existing strict ESM TypeScript, Node 24 crypto/fetch/http/fs; no framework or new runtime dependencies.

**Spec:** [Approved design](../specs/2026-10-28-github-app-owner-access-design.md), merged PR35 c723c18.

## Global constraints

- Members read only; no organization/repository Administration or user token, no ambient fallback.
- Organization-wide installation envelope; explicit repository/permission subsets for code operations.
- Credentials outside Git/SQLite/model output; existing Codex owner session remains a trusted host operator.
- New file formats start at schemaVersion1; existing config/SQL formats unchanged; App local Git marker version2 explicitly distinguishes PAT version1.
- No actual registration, grants, owner setup, project activation or spending during implementation tests.

## Review focus

- Remote browser vs devbox loopback: support a stated port-forward origin and protected import; never print callback codes.
- API success before local final persistence: preserve intent, block duplicate creation and require explicit attach to reconcile unknown outcome.
- Existing App binding rerun: reuse/revalidate it rather than create another App or overwrite its key.
- Malformed/overprivileged grants or changed account: fail before credential publication/provider writes.
- Git/gh credential fallback: an App-bound company always uses App transport, including helper failures and doctor.

### Task 1: Provider permission and credential contract

Files: `packages/providers/github/src/app.ts`, `app-api.ts`, `app-policy.ts`; export from index; `tests/github-app.test.mjs`.

Interfaces: `GitHubApp` with `verify()`, `withRepositoryToken(repository, use)` and narrowly scoped `createRepository(name, visibility)`; internal request transport receives method/path/body/auth with bounded source-safe errors. Connection `{schemaVersion:1,appId,installationId,organizationId,organization,ownerId,owner}`. No token-returning CLI API.

- [ ] RED: synthetic transport verifies rejected Members-write/Admin/unknown grants, wrong org/owner/app, expired or widened tokens, absent/foreign repo IDs; decode/verify signed JWT using a generated RSA fixture. Assert no POST after validation failure.
- [ ] Implement exact permission map (`metadata:read,contents:write,issues:write,pull_requests:write,repository_creation:write,organization_projects:write,members:read`), all-repositories private org-owned App validation and explicit token subsets/expiry.
- [ ] GREEN: `npm run build && node --test tests/github-app.test.mjs`; commit provider behavior.

### Task 2: Protected connection setup and native transport

Files: Core `private-artifacts.ts`, CLI `github-app-store.ts`, `github-app-setup.ts`, `github-app-transport.ts`; init/auth/doctor/CLI integration; `tests/github-app-setup.test.mjs`.

Interfaces: private exclusive write/read/atomic replacement helpers; `connectGitHubApp({companyDirectory,env,question,notice,importFile?,setupOrigin?})`; native `mz github credential` / `mz github status` with no secret JSON output.

- [ ] RED: manifest state/Host validation and consumed callback, private file import/path constraints, atomic new connection preservation, App-bound Git helper synthetic fill/failure without ambient fallback, init recommendation/existing-binding reuse and installed helper path.
- [ ] Implement localhost server with random state and manifest form, timeouts/cleanup; remote devbox uses forwarded loopback or configured HTTP loopback/HTTPS origin. Import is a protected schema1 JSON `{appId,installationId,organization,owner,privateKey}` alternative; keys only reach native protected files. Browser callback converts manifest and waits for installation/owner verification; no user OAuth. Default interactive method App; explicit token/existing/oauth compatible. App-aware doctor probes App identity.
- [ ] GREEN: targeted tests, full suite; commit connection and transport.

### Task 3: Audited pilot project creation/attach

Files: Core `provisioning.ts`, CLI `project.ts`, steward assignment instructions and routing; `tests/project-provisioning.test.mjs`.

Interfaces: `openProvisioningJournal` stores immutable schema1 intent/outcome per stable action ID through Core. `mz project create|attach NAME --approved [--public] [--action UUID]` uses saved owner installation; no user credential/API escape hatch. Default private, public requires explicit flag.

- [ ] RED: missing approval, unsafe name, audit unavailable, remote-name conflict, repeated action, foreign response, unknown create outcome and explicit attach recovery. Verify no remote write on denied requests and no duplicate POST after uncertain success.
- [ ] Implement preflight, durable intent, create/attach, durable outcome and company project reference scaffold without replacing existing knowledge; saved action can complete curated publication after interrupted local writes. Register actor/run provider identities and pending reconciliation; never auto-delete rollback. Steward discovers command help and invokes only within owner authorization.
- [ ] GREEN: targeted tests then full check/typecheck; commit project workflow and human guide.

### Task 4: Review and delivery

- [ ] One fresh whole-branch reviewer; fix Important/Critical findings in one RED/GREEN pass and full suite.
- [ ] Full `npm run check`, typecheck, installed help/synthetic real Git smoke, docs links and whitespace. Record evidence and limitations in FR015.
- [ ] Push/PR, exact-head push+PR CI, merge and fast-forward main; rebuild/install local launcher. Synchronize issue/private Project. Actual owner GitHub approval remains inside mz init, not development chat.

## Execution ledger

Owner explicitly requested merge and implementation; proceed inline without another approval round. Design PR35 merged c723c18 after exact-head push/PR CI. Worktree `.worktrees/fr015` is ignored through local Git exclude; no credentials copied. Baseline passed 434/434. Task1 RED observed missing provider export; GREEN 15/15 new provider cases and full suite 449/449. Exact token subsets, JWT signatures, rejected grants/identity/expiry verified with generated fixture keys.
