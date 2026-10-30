# Prepared project checkouts

Use the owner/steward's configured MZ App connection on the trusted devbox:

```sh
mz project checkout example-game /absolute/project/folder
cd /absolute/project/folder
source .mz/activate
codex 'Read AGENTS.md and .mz/HANDOFF.md, then help me plan the project through GitHub tickets.'
```

The destination's parent must already exist. This command clones over HTTPS or
checks that an existing checkout's root and fetch/push origin identify exactly
the selected repository. It preserves existing files, instructions and dirty
work. It does not install dependencies, execute project scripts or deploy.
An interrupted preparation may leave a partial checkout for inspection; it is not
deleted automatically. Repeating the command revalidates the destination.

The generated AGENTS.md requires GitHub Issues for features, tasks and bugs,
milestones for delivery goals, acceptance criteria and actual verification before
closing work. Existing AGENTS.md is preserved; read the local handoff as well when
working with an existing project. Product requirements still come from the owner.
Preparing a folder does not create a complete product backlog or start a worker.

## Credentials and activation

Git config contains a repository-pinned MZ helper reference, not a token. The
helper requests a fresh short-lived App installation token for native operations.
Activation selects the corresponding native gh wrapper and pins its repository
and permission profile; use explicit `--repo OWNER/REPO` where supported. For
`gh api`, use repository-qualified endpoints (`repos/OWNER/REPO/...`); that command
does not accept `--repo`.
Cross-project requests through the pinned helper are rejected. Restart a shell
without sourcing activation to leave this environment; use a fresh shell per
project rather than stacking activations.

The activated session ignores global/system Git configuration and inherited Git
configuration overrides so personal HTTPS headers and SSH URL rewrites cannot
bypass the project helper. Existing local authentication overrides/includes are
refused for reconciliation rather than silently reused. The checkout preserves a
local commit identity, copying nonsecret global user.name/user.email when present
or using a generic MZ worker identity otherwise; review it before committing.

The local `.mz/` directory is excluded through Git's local info/exclude file. It
contains only configuration references and the local handoff. Never place tokens
in project .env files, Git URLs, company knowledge, tickets or logs. Global GitHub
credentials are not modified. This trusted same-user host helper does not isolate
the App signing key from malicious code under that OS account.

## Delivery permissions

```sh
mz github permissions
```

This read-only command reports readiness, missing grants, the desired App
permission map and organization App settings link. Update the existing App's
Permissions & events, then accept its new installation grants in GitHub. Do not
register another App or copy its key into the project. MZ accepts the original
profile and known delivery grants while installation approval remains pending.
The required original grants remain mandatory; unknown grants or organization
permission expansions remain rejected. The diagnostic distinguishes missing App
registration grants from missing installation approval. GitHub's Variables API
grant is named `actions_variables` in the returned permission map.

After GitHub reports approval, rerun:

```sh
mz project checkout example-game /absolute/project/folder --delivery
cd /absolute/project/folder
source .mz/activate
```

Delivery tokens are restricted to the selected repository with Metadata read and
Contents, Issues, Pull requests, Actions, Workflows, Administration, Environments,
Deployments, Pages, Secrets, Variables, Checks and Commit statuses write. Native
gh supports secret, variable and label operations as well as the existing
repository/issue/PR/run/workflow/release/API commands. Some operations depend on
GitHub plan features and organization policy. This permission profile does not
itself authorize deleting resources, spending, deployment or organization changes.

Organization Projects remain steward responsibilities; project tokens contain no
organization Projects, membership or repository-creation grants. Milestones and
feature/task/bug issues can be used immediately. Deployment workflows also need
their own job permissions and separately provisioned project VPS/DNS/registry
credentials. GitHub developer credentials are not deployment credentials.
