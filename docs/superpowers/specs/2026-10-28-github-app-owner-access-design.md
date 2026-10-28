# Organization-owned GitHub App with protected owner access

Design draft for [FR-015](../../tickets/FR-015.md), 2026-10-28. Direction selected by the owner; this document awaits approval. No App integration or new project command is implemented yet.

## Intent and decisions

The owner wants to connect the company once through MZ, then steer projects through the steward without creating a personal token or switching to GitHub for each project. The owner accepted organization-wide App access, including future projects, and required that the App cannot reduce the owner's own permissions. Company context and the website brief remain conversations inside MZ.

Use an organization-owned, private GitHub App. The human remains an organization Owner and controls App registration/installation directly in GitHub. MZ acts as an installation, not as the owner's personal account. Organization-wide access is the approved installation envelope, not a worker's default scope.

This is M-05 onboarding and provisioning for the website pilot. It does not implement the M-06 scheduler or claim the real project is already activated.

## Approaches considered

1. Selected-repository personal token: implemented by BUG-001, but requires repository-selection maintenance and cannot mint narrower child personal tokens.
2. Organization-wide personal token: fewer setup interruptions, but tied to a person and unsuitable for automatic short-lived delegation. Keep explicit PAT/existing modes for compatibility rather than using either as a hidden fallback.
3. Organization-owned GitHub App: selected by the owner. One initial registration/installation, then automatic installation-token renewal and narrowing. Requires a provider implementation and a protected credential boundary.

## Owner access is outside App authority

GitHub permission enforcement is the first boundary, not a prompt rule or a periodically repairing watcher:

- Request **Members: read** only, for read-only verification of the designated human's active owner role. Never request Members write, even to manage other people: GitHub does not provide a Members-write grant with an exception for one protected user.
- Exclude organization Administration write, repository Administration write, organization role/permission management, blocking users and user/account authorization. Do not request a personal user access token during App installation.
- Request **Repository creation: write** separately. Do not substitute broad Administration write if this narrower grant is unavailable. Report the unsupported capability and offer attaching an owner-created repository instead.
- Do not expose operations for human membership/role changes, repository collaborator/team access changes, repository deletion/transfer or App grant expansion. Unknown operations and unknown/excess permissions fail closed.
- Keep a protected human GitHub numeric user ID and organization ID in host-controlled connection metadata. Resolve names read-only; renames do not silently substitute another identity. Initially verify the configured user is an active organization Owner. Never attempt a repair by granting, removing or demoting anyone.
- Worker-editable company knowledge may describe authority, but cannot modify the protected owner identity, credential binding or effective grant. Changing those requires the explicit owner connection flow outside a worker session.
- An owner can suspend/uninstall the App directly in GitHub even if MZ is unavailable. App keys and tokens do not replace that human access. MZ has no organization/user credential with which to revoke it.

This protects human ownership/access from the App's direct GitHub authority. It does not promise preservation of all writable data against malicious code or protection against another owner changing GitHub settings. Repository content, workflows and deployment credentials need their own security boundary. Do not grant broad personal tokens to workflows/runners reachable by the App as an indirect way to regain excluded authority.

## Connection workflow

`mz init` becomes the guided entry point with GitHub App recommended and PAT/existing modes explicitly available. It asks the technical organization and protected owner, explains the exact requested capabilities, then prepares the actual registration/installation URLs and permission settings. PAT fallback likewise generates a prefilled scope-suggestion URL rather than a generic settings link. A new connection never implicitly downgrades into a broader personal credential.

Prefer GitHub's App manifest flow to receive registration credentials directly into protected host storage. The human reviews/creates the organization-owned App and approves its installation in GitHub. Use a bounded single-use state-bound setup flow; validate organization/account, App identity, installation identity, repository selection and actual permission map on return. Store no secrets or one-time authorization codes in URLs printed to logs, Git, SQLite or model context. Keep browser/developer callbacks private; a remote devbox must offer a supported owner-reachable return path or explicit protected credential-file import, not assume its localhost is the owner's browser localhost. Detailed callback transport is a builder choice that must be resolved in the implementation plan before live setup.

No user OAuth authorization or Owner personal token is needed for normal operation. Verify the installation using App endpoints, not the existing PAT-mode `GET /user` probe. Reject mismatched, suspended or overprivileged installations. On an interrupted connection, preserve the previous working binding; resume or explain the incomplete new registration without silently creating duplicates. Never automatically revoke or overwrite unrelated credentials.

`mz guide` then collects company/devbox context, project purpose and authority. `mz ask` remains the normal ongoing interface. The owner can request website creation in conversation; the steward prepares a concrete provisioning request inside the authorized scope. Advanced CLI/API entry points remain available; final command spelling is a builder choice. Owner-facing success must report concrete created/attached resources and any pending steps, not imply the entire infrastructure or project is active after a clone.

## Permission envelope

| Permission                                                                                        | Grant and purpose                                                                                                                                            |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository Metadata                                                                               | Read, identity/access checks                                                                                                                                 |
| Repository Contents                                                                               | Write, code and curated knowledge                                                                                                                            |
| Repository Issues / Pull requests                                                                 | Write, work tracking and review                                                                                                                              |
| Repository creation                                                                               | Write, create new project repositories without broad Administration                                                                                          |
| Organization Projects                                                                             | Write, existing organization planning board; organizational scope is disclosed                                                                               |
| Organization Members                                                                              | Read only, verify protected owner membership                                                                                                                 |
| Repository Workflows / Actions / Secrets / Variables / Deployments                                | Add explicit required subsets to the reviewed installation profile when implementing the concrete website delivery workflow; never implied by Contents write |
| Organization/repository Administration, Members write, user permissions, App-management authority | Excluded                                                                                                                                                     |

The builder must map operation requirements to actual provider permission keys and verify current GitHub support before offering the profile. Explicitly enumerate all token permissions on issuance; do not rely on omitted fields inheriting the full installation grant. New capabilities outside the installed envelope need owner approval in GitHub; routine new repositories inside the envelope do not require a new personal token. If existing repository protection configuration requires excluded Administration authority, surface that as a human GitHub configuration step rather than silently expanding the App.

## Core, provider and credential boundary

Core owns generic project/action authorization and approved provider references. GitHub implementation owns JWT signing, installation-token issuance/renewal, permission mapping and API/Git transport. Runtime records store structural action IDs, outcomes and provider references only; Git owns curated company knowledge, and GitHub remains work/planning authority.

The App private key is a host secret referenced symbolically through SecretProvider, outside Git/company knowledge and SQLite. A credential broker validates explicit organization, project repository IDs, operation and permission subset. Short-lived tokens are limited to approved repository IDs and operation permissions. Missing, empty or foreign scope is an error, never shorthand for every repository. Organization-wide operations such as repository creation or board management run in the control plane with their own explicit scope, not a worker token.

Do not return keys or token strings to the model, logs, transcript or generic JSON. Prefer brokered provider operations/Git helpers; if a native child needs a token, supply it only to that child through an appropriate protected channel, and bound its lifetime. Revoke on cancellation where supported and never retry with ambient personal credentials after an access error.

A prompt and same-user file permissions do not isolate an untrusted worker from a signing key. The existing interactive Codex session is a trusted host operator. Before claiming isolation from workers, deploy the broker/key under a distinct host principal or equivalent enforced isolation and expose only authorized operations. The first increment may support trusted-owner-session operation, clearly labelled; it must not claim M-06 worker isolation or distribute broad installation tokens.

## Project creation and recovery

After owner activation/authorization, prepare the project identity, provider organization, requested repository name/visibility and initial work. Check read-only for conflicts before mutation; never adopt an unrelated same-name repository just because it exists. Create via the permitted App operation, default private unless publication is explicitly approved, and confirm the returned repository belongs to the configured organization and is visible to the installation.

Record append-only started/succeeded/failed provider action evidence with stable IDs, then curate approved project references/context in the company repository. Fail before provider mutation if required audit persistence is unavailable. Recover partial success by checking the recorded provider ID and reconciling the same action, not creating a second repository or deleting the first. GitHub and local knowledge updates cannot be one transaction: expose pending reconciliation and resume safely. Do not delete remote resources as automatic rollback.

Secrets required by project infrastructure are requested through a protected host-secret path. The steward records references and missing capabilities, not values. No live DNS, infrastructure spend, publication or secret provisioning is inferred from this design approval alone.

## Implementation sequence and acceptance

Plan staged delivery: (1) protected connection metadata/permission validation and suggested URLs; (2) manifest/import onboarding and scoped App credential transport; (3) pilot project create/attach plus audit/recovery through the steward. Each increment must be useful and honest about what is available. Any persistent schema change requires an explicit migration; do not repurpose BUG-001 metadata as an App credential without a versioned transition. Keep PAT/existing compatibility, with no silent fallback from App mode.

Verification must include deterministic tests for owner removal/demotion rejection before HTTP; rejected Members-write/Admin/user grants; identity mismatch; no ambient fallback; explicit narrowed tokens; expiration/suspension; missing/foreign repository scope; key/token/code redaction; interrupted setup; duplicate/retry/partial provider success; project publication authority; and doctor read-only structured failures. A synthetic request refusal is not proof of GitHub enforcement. During actual owner-approved setup, inspect installed permissions and verify owner role read-only. Never test removal/demotion on the real owner. Any live denial probe uses disposable fixtures under separate authorization. Actual website activation and delivery are separately evidenced.

## Sources and present limits

Official sources checked 2026-10-28:

- [Organization roles and owner authority](https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/roles-in-an-organization).
- [Membership mutation requires Members write](https://docs.github.com/en/rest/orgs/members).
- [Organization repository creation permissions](https://docs.github.com/en/rest/repos/repos#create-an-organization-repository).
- [GitHub App permission reference](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps).
- [Manifest registration](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest).
- [Installation-token repository/permission subsets and expiry](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).
- [Human installation access/suspension/uninstallation](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps).

No App has been registered/installed, no credential issued, and no permission or project changed while preparing this design. The installed version remains the PAT/existing/OAuth implementation. This document specifies the intended boundary and verification, not an already-tested owner-lockout guarantee.
