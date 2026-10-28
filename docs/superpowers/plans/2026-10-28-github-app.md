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

- [x] RED: synthetic transport verifies rejected Members-write/Admin/unknown grants, wrong org/owner/app, expired or widened tokens, absent/foreign repo IDs; decode/verify signed JWT using a generated RSA fixture. Assert no POST after validation failure.
- [x] Implement exact permission map (`metadata:read,contents:write,issues:write,pull_requests:write,repository_creation:write,organization_projects:write,members:read`), all-repositories private org-owned App validation and explicit token subsets/expiry.
- [x] GREEN: `npm run build && node --test tests/github-app.test.mjs`; commit provider behavior.

### Task 2: Protected connection setup and native transport

Files: Core `private-artifacts.ts`, CLI `github-app-store.ts`, `github-app-setup.ts`, `github-app-transport.ts`; init/auth/doctor/CLI integration; `tests/github-app-setup.test.mjs`.

Interfaces: private exclusive write/read/atomic replacement helpers; `connectGitHubApp({companyDirectory,env,question,notice,importFile?,setupOrigin?})`; native `mz github credential` / `mz github status` with no secret JSON output.

- [x] RED: manifest state/Host validation and consumed callback, private file import/path constraints, atomic new connection preservation, App-bound Git helper synthetic fill/failure without ambient fallback, init recommendation/existing-binding reuse and installed helper path.
- [x] Implement localhost server with random state and manifest form, timeouts/cleanup; remote devbox uses forwarded loopback or configured HTTP loopback/HTTPS origin. Import is a protected schema1 JSON `{appId,installationId,organization,owner,privateKey}` alternative; keys only reach native protected files. Browser callback converts manifest and waits for installation/owner verification; no user OAuth. Default interactive method App; explicit token/existing/oauth compatible. App-aware doctor probes App identity.
- [x] GREEN: targeted tests, full suite; commit connection and transport.

### Task 3: Audited pilot project creation/attach

Files: Core `provisioning.ts`, CLI `project.ts`, steward assignment instructions and routing; `tests/project-provisioning.test.mjs`.

Interfaces: `openProvisioningJournal` stores immutable schema1 intent/outcome per stable action ID through Core. `mz project create|attach NAME --approved [--public] [--action UUID]` uses saved owner installation; no user credential/API escape hatch. Default private, public requires explicit flag.

- [x] RED: missing approval, unsafe name, audit unavailable, remote-name conflict, repeated action, foreign response, unknown create outcome and explicit attach recovery. Verify no remote write on denied requests and no duplicate POST after uncertain success.
- [x] Implement preflight, durable intent, create/attach, durable outcome and company project reference scaffold without replacing existing knowledge; saved action can complete curated publication after interrupted local writes. Register actor/run provider identities and pending reconciliation; never auto-delete rollback. Steward discovers command help and invokes only within owner authorization.
- [x] GREEN: targeted tests then full check/typecheck; commit project workflow and human guide.

### Task 4: Review and delivery

- [x] One fresh whole-branch reviewer; fix Important/Critical findings in one RED/GREEN pass and full suite.
- [x] Full `npm run check`, typecheck, installed help/synthetic real Git smoke, docs links and whitespace. Record evidence and limitations in FR015.
- [ ] Push/PR, exact-head push+PR CI, merge and fast-forward main; rebuild/install local launcher. Synchronize issue/private Project. Actual owner GitHub approval remains inside mz init, not development chat.

## Execution ledger

Owner explicitly requested merge and implementation; proceed inline without another approval round. Design PR35 merged c723c18 after exact-head push/PR CI. Worktree `.worktrees/fr015` is ignored through local Git exclude; no credentials copied. Baseline passed 434/434. Task1 RED observed missing provider export; GREEN 15/15 new provider cases and full suite 449/449. Exact token subsets, JWT signatures, rejected grants/identity/expiry verified with generated fixture keys.

Task2/3: protected artifacts, browser state/Host checks and pending-resume safety, manifest conversion/import/reuse, App Git binding/native launcher and Core provisioning all have observed RED/GREEN tests. Real Git credential fill passed using a synthetic fetch preload (no network). CLI synthetic website create/resume passed with exactly one POST, explicit approval, durable Core journal and preserved knowledge. Full pre-review check passes 463 tests/build/lint/format; typecheck follows. No live App/token/project actions or model calls.

Ruling: GitHub's documented GET /app response has no public/private visibility field (confirmed against GitHub's published OpenAPI), so request public:false in the manifest and require human visibility review on protected imports rather than reject every real response for a nonexistent field. Cost if wrong: an imported App could be publicly installable, though MZ still pins organization/installation/owner IDs and excluded grants. Response-shape regression observed RED/GREEN.

Ruling: preserve the existing trusted-host owner-session boundary for this pilot; no claim of untrusted worker isolation until a separate signing principal/broker is deployed. Cost if wrong: same-user malicious code could read the host key; GitHub's excluded membership/administration authority remains the direct owner-access boundary.

Ruling: Core uses new version1 immutable host-file provisioning journals, avoiding an unrelated SQLite migration while storing no planning authority/content/secret values there. Cost if wrong: runtime backups must separately include these host artifacts; documentation states their location and partial-success recovery.

Final review: three Important findings, no Critical or Minor findings. One fix pass reproduced each with failing regressions and fixed (1) real Git askpass fallback via terminal quit=true plus disabled prompts; (2) lost registration/conversion history via a durable pre-registration intent and explicit recovery/import; (3) alternate/plaintext native API destinations and keyring fallback via relative GitHub endpoints only, rejected hostname overrides and child-only disabled D-Bus. All three targeted regressions GREEN; full post-fix suite 466/466 plus build/lint/format/typecheck. No deferred Minor findings.

Final: Ruling: the registration's installation_id callback parameter is not trusted; discover and verify the App's configured organization installation independently. Cost if wrong: callback mismatches are not individually diagnosed, but no foreign installation is selected.

Final: Ruling: preserve conservative unknown-create recovery through explicit attach rather than automatic adoption by name. Cost if wrong: an ambiguous failure requires owner/steward reconciliation instead of unattended recovery; no duplicate POST or automatic resource deletion.

Final: Ruling: keep minimal repository/project reference scaffolding and no terminal failed record for an unknown provider outcome; owner guide still supplies the actual brief/team and incomplete intents/attempts remain durable pending evidence. Cost if wrong: more project context and failure diagnostics must be supplied during the pilot, rather than falsely declaring full activation or remote failure.
