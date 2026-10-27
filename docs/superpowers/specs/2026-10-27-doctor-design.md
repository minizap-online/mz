# FR-007 environment doctor

Deliver MZ-007 and the MZ-005 backup-age check, completing the current M-01 implementation boundary. The active all-ticket instruction delegates routine choices. No host activation, provisioning, remote write, credentials or spending is needed.

## Approach

A doctor must not initialize or upgrade the store it is diagnosing. Reusing the normal writable state opener would silently create a missing database and migrate an old one. Add a separate adapter inspection exposed through Core: existing regular absolute path only, SQLite readOnly, current migration/schema and integrity/FK verification, WAL status and the same backup freshness computation used by writable Core state. Extract backup read/freshness helpers rather than duplicate policy. No persistent schema changes. SQLite may manage WAL sidecars; no main-file creation, migration, entity/event write, or backup is performed.

Core's runDoctor composes structured static checks. CLI asynchronously invokes it for doctor while preserving help/version use without a company or runtime. Options choose company directory (existing loader precedence), explicit runtime path, backup maximum age, host secret directory/bindings, and opt-in GitHub authentication. Environment may select company (existing MZ_COMPANY_DIR) and runtime (new MZ_RUNTIME_DB). No config schema changes, secret values, inline tokens, repair flags or shell commands are accepted.

## Checks and output

Each check has a fixed ID, pass/fail/unavailable status, static safe summary/action and optional nonnegative backup age in milliseconds. No input paths, identity names, command stdout/stderr, caught errors or secret references/values are rendered. Text and --json reports share the same model. Exit 0 only if all checks pass; exit 1 for an unhealthy/incomplete report; exit 2 for invalid invocation/configuration.

- Company: use the existing read-only loader. Company config errors fail safely without raw paths/field values. Scan parsed id/name for obvious token/private-key/Bearer/password-assignment patterns. This is a bounded heuristic, not secret detection assurance. Unsupported credential fields already fail schema validation.
- Runtime: inspect an existing current-schema SQLite database through Core, never create/migrate it. Failure blocks the backup check. Backup check reports never/fresh/stale/clock-skew and data age from snapshot start. Expose a later failed/pending attempt separately from freshness so old success cannot hide current trouble.
- Secrets: explicit host-file directory plus at least one symbolic ref-to-filename binding. Resolve and immediately dispose each handle to validate actual access without reveal/use/serialization. Missing configuration is unavailable; bad files/permissions fail. No general secret-manager probe or actual provisioning.
- Worker/Devbox command prerequisites: Node >=24, npm >=11, git, gh, codex and tmux. Use fixed argv, shell:false, ignored input and bounded execution/output. Report unavailable/failed tools with install/access actions; never print version output. Aggregate available prerequisites as devbox.tools, without claiming VM topology, SSH, persistence or Codex authentication. Devbox here is the private worker host, not an assumption that Jetify Devbox exists. Private DEVBOX.md remains the host inventory/runbook.
- GitHub authentication: opt-in --github-auth probes existing host gh credentials with read-only gh api user --silent and prompting disabled. Missing gh, failed/timeout authentication, and absence of the opt-in are reported accurately. Authentication success does not prove repository permissions or working domain integration. A separate github.integration check reports the FR-006 remote skeleton unavailable until implemented; never claim a production provider healthy.

## Verification

Synthetic fixtures cover fresh/stale/never/clock-skew, failure/pending latest attempts, corrupted/foreign/old/missing databases without mutation, config credential heuristics, real private-file secret access with disposal, bounded missing/failing commands, opt-in auth and raw-output non-disclosure. Spawn real CLI for text/JSON/exit codes, malformed options, help/version and clean installation from unrelated directories. Inject a trusted command probe only for deterministic tests, clearly separate from real subprocess evidence. Full check/typecheck, review and CI before merge. An actual host report may remain unhealthy because configuration and live provider integration are unprovisioned; that is expected evidence, not a claim of readiness.
