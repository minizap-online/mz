# Project delivery checkout implementation

Approved execution request: the owner asked to implement checkout/delivery access
and make both new projects usable with tickets immediately, while steward work
continues. This bounded FR-017 delivery takes priority over the broader FR-016 plan.

## Design and tasks

1. Keep legacy App grants working; accept only a defined delivery expansion.
   Request repository-only delivery tokens explicitly, fail clearly when grants
   are missing, and expose read-only upgrade instructions through github permissions.
2. Prepare project checkout directories, local Git credential bindings, renewable
   project-pinned gh activation, and create-missing-only ticket workflow instructions.
   Clone via HTTPS with no credential values in URLs/files/argv. Existing nonempty
   directories are accepted only if their actual Git root/origin identify this project.
3. Verify synthetic scope/renewal/preservation and full checks, independent review,
   then prepare the owner's two workspaces and initial bootstrap issues/milestones.
   Do not implement either product before its owner prompt.

Delivery permissions: metadata read; contents, issues, pull_requests, actions,
workflows, administration, environments, deployments, pages, secrets, variables,
checks and statuses write. Worker tokens exclude members, repository creation and
organization Projects. Existing organization steward access remains unchanged.
GitHub approval of new installed grants is an actual external owner requirement;
prepare everything else first. Workflow/runtime VPS credentials remain separate.

No credentials in checkout .env files. Activation contains only helper references,
repository identity and a profile name; Git/gh get a fresh token per operation.
Repository-local binding plus activation constrain helper requests to that project.
This is trusted same-user host operation, not isolation from a readable signing key.
No SQLite or existing connection schema changes. New helpers remain manually invoked.

## Execution ledger

Ruling: implement FR-017 first, rather than all FR-016 tasks — the owner's immediate
priority is independently usable ticket-based projects; broader onboarding remains
tracked separately and is not claimed delivered. Cost: interactive onboarding still
uses existing steward behavior until FR-016 is implemented.

Ruling: use native execution and one final fresh review — these changes share
credential/session interfaces; the user explicitly requested implementation after
the native recommendation. Cost: no per-task independent review.

Baseline: isolated worktree contains exact copies of existing dirty prerequisites;
the original checkout is untouched. Baseline full check passed 482/482 tests.

- [x] Permissions/profile regression RED then GREEN.
- [x] Checkout/session regression RED then GREEN.
- [x] Full checks and independent review.
- [x] Actual two-project readiness and truthful missing-grant handoff.

Verification before independent review: focused 21/21 and full check 487/487 pass,
including build, lint and formatting. Original versus expanded App grants remain
separate exact profiles; an upgraded registration with legacy installation grants
is accepted while GitHub approval is pending. New delivery tokens exclude all
organization-level grants. Review is running before installing the changed code.

Final review: no Critical findings; one Important inherited-global-authentication
finding reproduced RED with plain Git after activation, then fixed. A second RED
test pins refusal/preservation of local personal authentication. Activation now
removes inherited config overrides and ignores global/system configuration;
checkout also rejects conflicting local headers, rewrites, helpers and includes.
Nonsecret commit identity is copied into local config so Git remains usable.
The minor unsupported gh-api --repo instruction was corrected in generated prose
and documentation. No deferred minor findings remain.

Review scope rulings: BUG-006 prerequisites and FR-016 remain separately tracked;
live readiness follows implementation checks; same-user key isolation is explicitly
not claimed; actual deployment and scheduling are outside this feature. Cost if
misunderstood: treating prepared developer access as deployed/isolated unattended
workers. The docs and final handoff retain those distinctions.

Post-review full check passed 489/489 plus build/lint/format; typecheck passed.
Reviewed source is installed behind the existing original-path MZ launcher.
Both actual private checkouts and initial issues/milestones are prepared without
changing product source. The installed App connection remains healthy; actual
delivery grants are missing and require owner approval through GitHub. Their
absence does not block the prepared development/ticket workflow. No VPS/DNS or
workflow runtime secrets were provisioned. Broad FR-016 work remains separate.

Live Ruling: accept explicitly allowlisted repository delivery extensions and
partial registration upgrades while retaining mandatory original grants — the
actual App registration changed during readiness verification, and GitHub returns
actions_variables for Variables. Arbitrary organization grants remain rejected;
token-response permissions are still validated exactly. Cost if wrong: a known
repository extension could be accepted before intended; it is passed to a worker
only under explicit delivery mode for one repository. RED/GREEN fixtures capture
the actual permission shape and missing-Checks diagnostic. Final check 490/490
passes. Real activated Git remote and initial issue access pass for both projects.
