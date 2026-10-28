# MZ maintainer acceptance test plan

For normal first use, follow [mz init → mz guide → mz ask](getting-started.md); the manual paths/UUIDs below are test-fixture plumbing, not onboarding requirements.

Use this plan to check the delivered CLI and understand which parts are ready for a real pilot. Start with synthetic local data: the offline walkthrough needs no credentials, model calls or production configuration. Allow roughly 20–30 minutes for the first run. Live checks are separate and optional.

## What has been developed

| Area              | Delivered behavior                                                                                                                                         | Interface and scope                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Bootstrap         | TypeScript workspace, build/check pipeline, CLI installation, public implementation/private company separation, issues/Project tracking                    | FR-001/FR-013; MIT copyright attributed to expeter                               |
| Company loading   | Read-only YAML/Markdown loading, schema/path validation and bounded curated reads                                                                          | FR-002; Core API, generic company starter                                        |
| Runtime state     | SQLite migrations through version 5, transactions, append-only events, runs and structural references                                                      | FR-003; Core API, no raw SQL worker interface                                    |
| Secrets           | Symbolic references, protected host-file binding, scoped opaque handles and redaction                                                                      | FR-004; Core API, no credential provisioning                                     |
| Backup/restore    | Native snapshot, encrypted-storage hook, audit/freshness tracking and encrypted synthetic restore tests                                                    | FR-005; Core API; production storage/scheduling not deployed by this work        |
| Provider boundary | Neutral work/source-control contracts and audited offline GitHub skeleton                                                                                  | FR-006; live GitHub domain actions remain unavailable                            |
| Diagnostics       | Existing environment/runtime/backup/secret/tool checks and optional GitHub identity probe                                                                  | FR-007; `mz doctor`; no repair or provisioning                                   |
| Private intake    | Bounded Markdown file/stdin ingestion, retained private original bytes, structural source reference                                                        | FR-008; `mz ingest`                                                              |
| Inbox review      | List, inspect, classify, scope, mark reviewed and inspect immutable change history                                                                         | FR-009; `mz inbox`; no automatic publication or activation                       |
| Context           | Deterministic bounded role/project/task context, selected sources and digests                                                                              | FR-010; `mz context`; offline                                                    |
| Worker guidance   | Thin skill with implemented commands, assigned scope and recording boundaries                                                                              | FR-011; `packages/skill/SKILL.md`                                                |
| Steward           | Curated/scoped runtime status; bounded advisory discussion, same-scope continuity and private response/handover; separately approved decision writer/audit | FR-012; `mz status`, configured `mz ask`, trusted host Core recording interfaces |

FR-001 through FR-011 and FR-013 are complete. FR-014 adds devbox installation, remembered technical setup and Codex-backed owner onboarding; see its ticket for current verification. FR-012 implementation is merged; its remaining acceptance item is starting a real authorized pilot. There is no web UI, automatic worker execution, live GitHub work integration or autonomous project activation. The current development version is 0.1.0; these are private workspace packages, not published npm releases. See the [ticket register](tickets/README.md) and [M-04 evidence](milestone-m04-verification.md).

## 1 Install and run regression checks

Run from the MZ repository root with Node.js 24+ and npm 11+:

```bash
node --version
npm --version
npm ci
npm run check
npm run typecheck
```

Pass: installation, build, lint, formatting, tests and typecheck succeed. Pre-onboarding baseline on 2026-10-28: all 403 automated tests passed, including clean installation, encrypted fixture restoration and synthetic steward HTTP tests. Those tests do not make live model/provider calls. Record the actual current test count and commit when you run them.

## 2 Create an isolated synthetic workspace

Use one Bash terminal for the following steps. This creates only disposable test data outside the repository; it does not initialize a real company or authorize a project. Do not substitute production paths.

```bash
MZ_TEST_REPO="$(pwd)"
MZ_TEST_ROOT="$(mktemp -d /tmp/mz-owner-acceptance.XXXXXX)"
export MZ_TEST_ROOT
export PATH="$MZ_TEST_REPO/node_modules/.bin:$PATH"
cp -R templates/company "$MZ_TEST_ROOT/company"
mkdir -m 700 "$MZ_TEST_ROOT/intake" "$MZ_TEST_ROOT/steward"
export MZ_COMPANY_DIR="$MZ_TEST_ROOT/company"
export MZ_RUNTIME_DB="$MZ_TEST_ROOT/runtime.sqlite3"
export MZ_SOURCE_DIR="$MZ_TEST_ROOT/intake"
export MZ_STEWARD_DIR="$MZ_TEST_ROOT/steward"
export MZ_ACTOR_ID=11111111-1111-4111-8111-111111111111
export MZ_WORKER_ID=22222222-2222-4222-8222-222222222222
node --input-type=module -e '
  import { openRuntimeState } from "@mz/core";
  const state = openRuntimeState({ path: process.env.MZ_RUNTIME_DB });
  console.log(state.getStatus());
  state.close();
'
```

Pass: schemaVersion is 5, journalMode is `wal`, foreignKeys is true. The UUIDs are synthetic identities. This one-time initialization is an operator Core operation; `mz doctor` and status/read commands do not initialize databases.

## 3 Discover commands and compile context

```bash
mz --help
mz --version
mz ask --help
mz context --role developer --project example-project --task review --json > "$MZ_TEST_ROOT/context.json"
```

Pass: help lists doctor, ingest, inbox, context, status and ask. Version is 0.1.0. Inspect `context.json` locally: selection must name developer/example-project/review; sources include that project's task, authority and required policies, with SHA256 references. Full output fits 65536 bytes. The template project remains `pending-owner-approval`; compiling context has not activated it.

## 4 Inspect status and doctor

```bash
mz status --project example-project --json
mz status --json
mz doctor --json > "$MZ_TEST_ROOT/doctor.json"
```

Pass: selected-project status shows curated template evidence and available empty runtime counts. Live provider state is unavailable. Company status may show missing `STATUS.md`/`projects/index.yaml`; missing inventory must not become a claim of a healthy empty organization. Status output fits 96 KiB.

Doctor is expected to exit **1** in this fixture: there is no backup, no configured secret binding, authentication probing is not enabled and the GitHub domain provider is offline. Read each check/action in `doctor.json`; local company/runtime checks should pass. Some host tools may also be unavailable. Exit 1 is an honest incomplete-readiness report, not failure of this acceptance step. No `--github-auth` probe is needed for this walkthrough.

## 5 Import and inspect one private idea

```bash
printf '%s\n' '# Owner acceptance fixture' '' 'Review a synthetic pilot idea. Do not publish or activate it.' > "$MZ_TEST_ROOT/idea.md"
mz ingest "$MZ_TEST_ROOT/idea.md" --scope project-candidate --json > "$MZ_TEST_ROOT/ingest.json"
MZ_TEST_ITEM_ID="$(node --input-type=module -e '
  import { readFileSync } from "node:fs";
  console.log(JSON.parse(readFileSync(process.argv[1], "utf8")).item.id);
' "$MZ_TEST_ROOT/ingest.json")"
MZ_TEST_SOURCE_ID="$(node --input-type=module -e '
  import { readFileSync } from "node:fs";
  console.log(JSON.parse(readFileSync(process.argv[1], "utf8")).item.sourceId);
' "$MZ_TEST_ROOT/ingest.json")"
export MZ_TEST_ITEM_ID MZ_TEST_SOURCE_ID
mz inbox list --json
mz inbox inspect "$MZ_TEST_ITEM_ID" --json
cmp "$MZ_TEST_ROOT/idea.md" "$MZ_SOURCE_DIR/$MZ_TEST_SOURCE_ID/content.md"
```

Pass: one item exists with scope project-candidate, classification unclassified, triaged false, revision 0 and “Summary pending.” List/inspect show identities and a private source reference, not the Markdown body or original path. `cmp` exits 0, proving retained source bytes match. No issue, activation or model call occurs.

## 6 Triage and verify continuity

```bash
mz inbox triage "$MZ_TEST_ITEM_ID" --classify idea --scope project:example-project --triaged --json
mz inbox history "$MZ_TEST_ITEM_ID" --json
mz inbox triage "$MZ_TEST_ITEM_ID" --classify idea --scope project:example-project --triaged --json
mz inbox history "$MZ_TEST_ITEM_ID" --json
mz status --project example-project --json
```

Pass: first change creates revision 1 and one linked history record; identical repeated triage is a no-op, leaving revision/history unchanged. Selected project status now counts one inbox item and one triaged item. Start a new `mz` invocation or reopen the terminal with the same explicit test paths and confirm the review persists; it does not depend on chat history. Classification/scope changes do not activate the template project.

The operator can additionally check structural audit totals through Core:

```bash
node --input-type=module -e '
  import assert from "node:assert/strict";
  import { openRuntimeState } from "@mz/core";
  const state = openRuntimeState({ path: process.env.MZ_RUNTIME_DB, existingOnly: true });
  try {
    assert.equal(state.listEvents().length, 2);
    assert.equal(state.getInboxDetails(process.env.MZ_TEST_ITEM_ID).revision, 1);
    console.log("PASS: one ingest event and one triage event; repeated review/read added none");
  } finally { state.close(); }
'
```

## 7 Check invalid inputs and missing steward setup

Run these individually and record each exit code immediately (`echo $?` in Bash):

```bash
mz inbox list --limit 0
mz context --role developer --project example-project --task missing-task --json
mz status --runtime "$MZ_TEST_ROOT/does-not-exist.sqlite3" --project example-project --json
MZ_STEWARD_MODEL= mz ask "$MZ_TEST_ROOT/idea.md" --role developer --project example-project --task review --json
```

| Check                                  | Expected result                                                         |
| -------------------------------------- | ----------------------------------------------------------------------- |
| Invalid list limit                     | Exit 2; static usage error, no state change                             |
| Missing curated task                   | Exit 1; safe context failure, no partial private contents               |
| Missing runtime status                 | Exit 0 with runtime unavailable; the named database must not be created |
| Explicitly empty steward model setting | Exit 2 before invocation; no model request, interaction or charge       |

These are expected rejection/unavailability tests, not successful operations to “fix” by supplying credentials. Repeat the Core audit check above: it must still report two events and revision 1.

## 8 Exercise the deeper Core boundaries

`npm run check` covers these without manual production setup. For focused reruns after a build:

```bash
node --test tests/company.test.mjs tests/state.test.mjs tests/state-migrations.test.mjs tests/secrets.test.mjs tests/backups.test.mjs tests/providers.test.mjs
node --test tests/steward-*.test.mjs
```

Pass: migration/transaction rollback, append-only history, protected secret handles/redaction, encrypted synthetic restore, provider audit boundaries, project isolation, byte/time limits, private artifact permissions, independent decision approval/write ordering and pending/failure behavior all pass. The steward suite includes real CLI dispatch and the OpenAI adapter with a synthetic HTTP transport. There are no `mz backup`, `mz restore` or general `mz decision` CLI commands; test their existing Core contracts rather than inventing commands or opening SQLite directly.

## 9 Optional live acceptance

Keep these **Not run** until the actual host prerequisites and authorization exist. They are not required to pass the synthetic walkthrough, and this plan does not execute them for you.

| Test                        | Prerequisite                                                                                                                                                                 | Pass evidence                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One real steward discussion | Approved transmission/spending scope, explicit supported model/output-token cap, protected secret binding and persistent private storage; follow [steward setup](steward.md) | A configured `mz ask` succeeds, returns useful scoped advisory proposals/handover, persists a successful interaction/run/source reference and private response; a second request uses same-scope continuity. No proposed action is applied automatically. Record actual output quality, latency and provider usage privately. |
| Approved decision           | Trusted host approver and private knowledge writer, using the documented Core interface                                                                                      | Exact proposal is approved, durable private decision file exists, then linked decision.recorded audit exists. Missing approval/writer yields no successful reference. A UUID alone is not approval.                                                                                                                           |
| Production recovery drill   | Configured encrypted destination/keys and retrieval, retention, ownership and separate source/steward artifact backups                                                       | Restore into a separate isolated location and verify runtime plus retained source/interaction/knowledge references. A green synthetic restore alone does not establish deployed recovery.                                                                                                                                     |
| Real pilot                  | Owner supplies a real idea and scope; later approves its concrete activation brief                                                                                           | Actual private intake/review/activation/knowledge/assurance evidence following [pilot handoff](pilot-handoff.md). Only then can FR-012's final acceptance close and later MZ automation be considered.                                                                                                                        |

The GitHub domain integration is still an offline skeleton. A successful optional doctor identity probe would not prove real issue/source actions exist. Web UI and automatic worker execution are future milestones, not acceptance failures of this release.

## Results and exit criteria

Keep a private run record with commit, Node/npm versions, date/operator, each step's Pass/Fail/Not run result, actual exit codes and sanitized error/reproduction. Do not attach credentials, raw company context or retained intake to public tickets. Report reusable failures as BUG tickets; retain organization-specific evidence privately.

| Group                          | Required result                                               | Your result and evidence |
| ------------------------------ | ------------------------------------------------------------- | ------------------------ |
| Regression/build/typecheck     | All pass                                                      | Not run                  |
| Discovery/context/status       | Expected selected scope, bounds and honest unavailable fields | Not run                  |
| Intake/triage/persistence      | Source bytes match; revision 1/history 1/events 2             | Not run                  |
| Rejection tests                | Expected exits 2/1/0/2, no extra mutation or model call       | Not run                  |
| Core/restore/advisory fixtures | All pass                                                      | Not run                  |
| Live model/decision/recovery   | Only with configured authorized host                          | Not run                  |
| Real pilot                     | Actual owner-authorized start                                 | Not run                  |

Offline acceptance passes when steps 1–8 meet their expected results. It does not close FR-012's real-pilot item. Leave the synthetic directory available for inspection; no cleanup command is required. After reviewing results, remove only the disposable directory you created, and close this test terminal to discard its environment settings.
