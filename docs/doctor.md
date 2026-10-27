# Environment doctor

FR-007 adds `mz doctor` for inspecting the M-01 boundary. It reports company configuration, credential-pattern heuristics, existing runtime integrity, backup data age/latest outcome, explicit secret bindings, worker commands, opt-in GitHub identity access, and the offline provider's availability. It does not repair, provision, initialize, migrate, back up or activate anything.

```sh
mz doctor --help
mz doctor --company /absolute/private/company --runtime /absolute/control-plane/state.sqlite3
mz doctor --json
```

Company selection follows the [existing loader](company-repository.md), including `MZ_COMPANY_DIR` and ancestor discovery. Runtime selection is explicit `--runtime FILE`, falling back to `MZ_RUNTIME_DB`. It must be an existing regular absolute file, not a final symlink. CLI options override environment selections; no runtime path is inferred from a company repository or worker checkout. An old database must be deliberately migrated through the normal control-plane opener using the matching release. Doctor rejects it and never changes its schema or events. SQLite read-only access may still manage WAL/SHM sidecars as part of SQLite's storage protocol; retain the same local filesystem/WAL requirements as [runtime state](runtime-state.md).

## Options and exit codes

| Option                         | Meaning                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `--company DIR`                | Explicit company repository selection; relative paths follow loader rules       |
| `--runtime FILE`               | Existing absolute runtime file                                                  |
| `--backup-max-age-hours HOURS` | Positive whole-hour maximum data age; default 24                                |
| `--secret-directory DIR`       | Absolute private host-file secret directory                                     |
| `--secret-binding REF=FILE`    | Repeatable symbolic reference to a simple filename; requires a secret directory |
| `--github-auth`                | Opt into a read-only identity request through existing host `gh` authentication |
| `--json`                       | Emit the same structured report as JSON                                         |
| `--help`, `-h`                 | Show command help without running probes                                        |

Exit 0 means every reported check passes; 1 means at least one check fails or is unavailable; 2 means invalid invocation/settings. Failed or unavailable checks include an action. Unknown/duplicate options, missing values, invalid age settings, relative runtime/secret paths and incomplete secret bindings fail safely without echoing arguments. Secret bindings may repeat the flag but cannot duplicate a reference. Never pass a credential value on the command line. The offline provider is currently always unavailable, so a current complete doctor report exits 1 even when the configured local checks pass; this prevents a false production-readiness claim.

Text and JSON expose fixed check IDs/statuses, static summaries/actions, and optional backup age. They do not contain input paths, company names, secret references/values, raw command output or caught exception details. Reports can still reveal deployment availability and should be shared deliberately. `--help` and version do not require configuration or run diagnostics.

## Checks and evidence

- `company`: read the supported private company config using Core. Missing/invalid config fails; rejected paths and field values are withheld.
- `config.secrets`: scan supported id/name fields for common GitHub token patterns, access-key patterns, private-key headers, Bearer credentials and password/token/secret assignments. Unsupported fields already fail schema validation. This bounded heuristic does not prove absence of credentials; rotate an exposed credential and move values into host storage.
- `runtime`: inspect a current-schema database with migration/checksum/schema, WAL, SQLite integrity and foreign-key checks under one read transaction. Missing/foreign/empty/old/drifted files fail without main-file creation or automatic migration. No raw connection is exposed through Core.
- `backup.freshness`: report never/fresh/stale/clock-skew using the same policy as [backups](backups.md). `ageMs` measures time since the newest successful snapshot's attempt start, conservatively bounding data age rather than upload completion. Future timestamps return unknown/null age and an action to check host time.
- `backup.latest-attempt`: independently fail for no attempt, latest failure or pending attempt, even if an older successful snapshot is fresh. Reconcile pending work with the backup process and external storage before retrying or deleting staging. Local success metadata does not independently prove encryption, off-host storage, retention or a restore drill.
- `secrets.access`: with an explicit directory and at least one binding, use the host-file provider to resolve each handle and immediately dispose it. No `revealText`, serialization, diagnostic matching, event or value export occurs. Missing configuration is unavailable; invalid files/permissions or failed resolution fail. Configure private ownership/files according to [secret handling](secrets.md); doctor does not provision them.
- `tool.node`, `tool.npm`, `tool.git`, `tool.gh`, `tool.codex`, `tool.tmux`: verify Node >=24, npm >=11, and successful fixed command version probes for the other tools. Tool availability does not prove accounts, Codex authentication, tmux session readiness or project capabilities.
- `devbox.tools`: aggregate these worker prerequisites. “Devbox” means the private worker environment, not a Jetify Devbox CLI requirement. Use private DEVBOX.md to verify SSH/access, workspace conventions, persistent control-plane storage outside workers, and recovery separately. Tool success does not verify VM topology or storage placement.
- `github.auth`: without `--github-auth`, explicitly unavailable. With it, run fixed `gh api user --silent` using the host's existing GitHub CLI configuration/credentials. Failure or timeout fails; missing gh is unavailable. Success proves identity-request access only, not private repository permissions or domain provider functionality. No auth setup/login is performed and `.env` files are not loaded.
- `github.integration`: the FR-006 implementation is an offline skeleton. Report unavailable until real integration and capability checks are implemented and verified.

Probes use `execFile` with fixed executable/arguments, no shell, closed input, disabled GitHub/Git prompting, a 4096-byte stdout/stderr buffer cap and SIGKILL timeouts (5 seconds per version command, 10 seconds for the optional identity request). Captured output and exceptions are discarded from reports; only npm's major version is parsed. The process inherits the operator's trusted PATH and host configuration. Do not run doctor against an untrusted executable PATH; a diagnostic command is not a subprocess sandbox. Commands execute sequentially and may take about 35 seconds at their limits.

## Core integration and verification

Core exports `inspectRuntimeState({path, now?, maxAgeMs?})` for a structured read-only inspection, and `runDoctor(options, host?)` for check orchestration. `DoctorHost` is a trusted injection seam for deterministic command tests, not a remote plugin boundary. Core options accept `company`, `runtimePath`, `backupMaxAgeMs`, canonical UTC `now`, host-file `secrets`, and `githubAuth`. Invalid structural options throw static `DoctorError`/`INVALID_DOCTOR_OPTIONS`; unavailable resources become check results. Core does not infer environment runtime selection; the CLI supplies it.

Synthetic tests compare backup policy against normal state, verify no creation/migration/history mutation, resolve actual private test credential files without revealing them, test config heuristics and unavailable integrations, and exercise real CLI text/JSON/exit codes from unrelated directories. A real subprocess fixture hangs, overproduces output and writes credential-like stderr to verify bounds and output suppression. Clean installation exercises the installed doctor. No production database, real secret, live GitHub authentication or deployment readiness is claimed by these fixtures.
