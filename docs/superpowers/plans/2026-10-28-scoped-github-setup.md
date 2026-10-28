# Scoped GitHub setup correction

Use executing-plans inline with one final independent review. BUG-001 is the binding requirement: scope and identity must be explained before login; fine-grained token is the recommended interactive route, OAuth only an explicit broader alternative. Company context questions remain in MZ.

## Implementation

- [ ] RED: native-client tests for explicit token/OAuth/existing choice, scope text before secret entry, no implicit browser fallback, correct transport and separate Codex login explanation.
- [ ] Implement bounded hidden token input/protected-file reference, passing token only on GitHub CLI stdin; no token argument/environment exported to Codex/log/SQLite/Git.
- [ ] Isolate native GitHub CLI credentials in a private MZ-owned GH_CONFIG_DIR outside Git/company knowledge. Use provider-owned private-file storage explicitly, not an OS-keyring entry that could replace the same account's unrelated personal credentials. Store only profile references in local Git config, with per-client helper selection; no global credential-helper change.
- [ ] Reuse that profile in native Git clients/owner Codex sessions using profile references only. Preserve inherited credential behavior when the owner explicitly chooses existing access or there is no MZ profile.
- [ ] Retain automated --yes and explicit --github-token-file; never prompt/auto-login from noninteractive mode. Scope recommendations are not proof all optional write permissions were granted; verify identity/read access without write probes.
- [ ] Tests, masked-input PTY probe, docs/current-provider sources, check/typecheck, independent review, exact-head CI/merge/rebuild/installed help and ticket/Project evidence.

## Rulings

GitHub CLI recommends GH_TOKEN for generic fine-grained-token use. Here, passing it into the long-lived Codex process would expose a credential unnecessarily and would not configure ordinary Git. Use the CLI's supported --with-token stdin login in an MZ-private profile and operate only selected resources; no token is placed in the model environment. The official CLI v2.103.3 source accepts fine-grained tokens with no classic-scope header. Native credential storage is explicitly private-file/unencrypted; this avoids shared OS-keyring host/account entries replacing personal credentials and is explained before entry.

Signing in is not organization membership provisioning. Recommend an optional dedicated org Member with only selected-repo Write access, no Owner/billing/member administration; do not create/invite/grant/revoke accounts or credentials in development. Suggested token permissions are staged: Metadata read and Contents read for clone (write for maintained knowledge), Issues/PR write only when needed, org Projects write only for the actual org board, no speculative administration/workflow/secret scopes. Keep expiry finite per organization policy.

Implementation/verification: native client/profile/token and compatibility tests pass; full npm run check430/430 plus build/lint/format and typecheck pass. Real PTY entry did not echo the synthetic token; oversized unterminated entry was rejected. Real Git credential transport passed with profile paths containing spaces/apostrophes, with no global helper change or ambient token override. Preflight conflict regression rejects before credential reads. No real owner authentication/membership/token issuance was performed. Preparing independent final review.
