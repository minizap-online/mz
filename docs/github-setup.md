# GitHub credentials for MZ

For company/project management, MZ recommends an [organization-owned GitHub App](github-app.md). This page documents the explicit personal-token alternative, with organization/repository selection. This is separate from Codex/ChatGPT model authentication. Signing in neither creates a GitHub user nor joins or grants membership in an organization.

Run `mz init --repository https://github.com/OWNER/company.git`. Before authentication, MZ shows the target and access guidance, then offers **app**, **token**, **existing**, or **oauth**. App is the recommended interactive default; token remains available; browser/device-code OAuth is never an automatic recovery from a failed clone.

## Identity and permission profile

Use your existing approved account, or optionally a dedicated automation identity that the organization owner invites as a regular **Member**. For that identity, use base repository access None and a restricted team with **Write** access only to the intended repositories. Do not make it an organization Owner, billing manager or membership administrator for setup. A token cannot exceed its issuer's access. [Organization roles](https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/roles-in-an-organization), [repository roles](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization).

Create the token in [GitHub fine-grained token settings](https://github.com/settings/personal-access-tokens/new). Select the actual organization as Resource owner and Only select repositories, initially the private company repository. Set a finite expiry, such as 30 days for the pilot, within organization policy. Organization approval may be required; a pending token will not provide the intended private access. If the organization is absent, check membership and its token policy. [GitHub token setup](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

| Capability                                      | Suggested permission              | When needed                                                                                                       |
| ----------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Read repository metadata                        | Metadata: Read                    | Initial connection; included by GitHub                                                                            |
| Clone company knowledge                         | Contents: Read                    | Initial connection                                                                                                |
| Maintain/sync company knowledge or project code | Contents: Read/write              | Normal approved Git maintenance/development                                                                       |
| Manage tickets                                  | Issues: Read/write                | When steering that work                                                                                           |
| Open/review/manage pull requests                | Pull requests: Read/write         | When that workflow is used                                                                                        |
| Update the organization's planning board        | Organization Projects: Read/write | Only for actual board operations; this permission is organizational, not limited to one selected repository/board |

Repository creation, administration, membership changes, secrets and workflow changes are separate capabilities; they are not requested simply to clone the company. Extend access for an actual approved need, not speculative automation. Permission names and requirements are defined by [GitHub's endpoint permission reference](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens). Organization-board token support is documented in [GitHub's Projects authentication guide](https://github.github.com/gh-aw/reference/auth-projects/).

MZ confirms the authenticated username and checks repository reading through clone or a read-only remote check. It does not perform write probes or claim every optional grant is present. Token syntax is not proof of permission. GitHub enforces the configured rights.

## Entering and storing the token

Enter the token only in MZ's explicitly labelled **hidden credential field**, never in an owner conversation or command argument. MZ does not echo it or persist it in company knowledge, Git, SQLite, logs or a model environment. Automation can use `--github-token-file /absolute/protected/file`; the existing source must be a private regular file outside Git/company knowledge, following the [host-secret checks](secrets.md). There is no `--token VALUE` option.

MZ sends the value on stdin to native `gh auth login --with-token`. GitHub CLI keeps it in a dedicated private profile under the MZ config directory (`github/`). This profile uses explicit owner-only **unencrypted local-file storage**. It does not overwrite a same-account shared OS-keyring entry or your unrelated personal GitHub CLI profile. On the Linux devbox, MZ installs a private `gh` launcher that disables shared Secret Service keyring access for that client; selecting file storage alone is insufficient because native GitHub CLI can still consult shared entries during login. The steward retains its normal Codex credential access. New private-profile setup currently requires Linux; explicit existing authentication remains available elsewhere. Input-file references are not automatically deleted; manage that source under your own secret-retention policy.

GitHub CLI recommends `GH_TOKEN` for generic fine-grained-token usage. MZ instead uses its supported stdin login/private profile so that a token is not exported to the long-lived Codex/model process and ordinary Git can use the same credential. Fine-grained tokens have resource limits; unrelated `gh` operations are not assumed to work. See [GitHub CLI authentication](https://cli.github.com/manual/gh_auth_login).

Only a profile path/helper reference is saved in the company's local `.git/config` (`mz.github.version=1`); no secret is stored there. MZ clients and the owner session receive that profile reference, with unrelated ambient GitHub token overrides removed. GitHub helpers are scoped to GitHub and the company checkout/client environment; no global Git helper is changed. Both markers absent retains the legacy inherited-auth behavior. Unknown/mismatched markers or unsafe profile paths fail rather than selecting a broader credential. This is initial optional local Git metadata, not a SQL/settings schema migration.

## Explicit alternatives

**Existing** retains the chosen checkout's/current Git authentication and does not narrow its permissions or open a new login. **OAuth** opens GitHub CLI's browser flow only when explicitly selected. Its baseline `repo`, `read:org` and `gist` scopes are broader than a selected-repository fine-grained token; adding `--scopes` does not turn it into that token. Prefer the restricted Member/team identity described above if OAuth is chosen. HTTPS and SSH authentication follow their selected transports; fine-grained tokens use HTTPS. [GitHub CLI login behavior](https://cli.github.com/manual/gh_auth_login).

If a previous init is still waiting at the old device-code screen, cancel it with Ctrl+C and restart init after updating. Existing accounts, memberships and provider credentials are not automatically revoked or changed by development. Actual chosen login/rotation becomes an owner operation inside the new wizard.

A later **Codex / ChatGPT** login is labelled separately. Its device code is a remote-terminal authentication method; account/workspace access and Codex tool permissions are different from GitHub repository rights. A GitHub token cannot sign in to Codex. [Official OpenAI authentication documentation](https://learn.chatgpt.com/docs/auth).
