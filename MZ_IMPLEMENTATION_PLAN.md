# MZ Implementation Plan
## Codex implementation brief for the MiniZap organization toolbox

**Status:** v0 design  
**License:** MIT  
**Primary goal:** make the *next* MiniZap project start and operate through MZ without building another agent-orchestration framework.

---

## 1. Mission

MZ is a small open-source toolbox for running a software organization whose workers may be humans or agents.

MZ does **not** provide intelligence. Codex or another coding agent remains the worker.

MZ provides four things:

1. **Identity** — who is acting and in which role?
2. **Context** — what company, process, project, decision, and task knowledge is relevant?
3. **Work** — what is currently requested and where is its source of truth?
4. **Authority** — what may this worker do to which resources?

The core design principle is:

> Build the company, not the agent framework.

MZ must stay useful if an actual human developer joins MiniZap tomorrow.

---

## 2. Explicit non-goals

Do not build these for MZ v0/v1:

- an agent swarm
- agent-to-agent chat infrastructure
- autonomous role creation
- a custom Jira clone
- a custom CI/CD system
- a message bus
- Redis
- Kubernetes
- a vector database
- a general workflow engine
- a proprietary secret manager
- a complex scheduling system
- a large dashboard before the CLI works
- GitLab/Codeberg support before the GitHub path works

Compatibility with other providers should be preserved in interfaces, not implemented prematurely.

---

## 3. Worker environment integration

MZ integrates with an existing Git, GitHub CLI, Node, tmux, and coding-agent environment. A project maps to a workspace and worker session. Actual host topology, access configuration, inventory, and operator conventions belong in the private company repository.

The worker environment is not the authoritative organization database. MZ must integrate with it rather than replace it.

---

## 4. Open-source repository vs. MiniZap organization data

Keep the implementation and the concrete organization strictly separate.

### Public repository: `minizap-online/mz`

```text
mz/
├── packages/
│   ├── core/
│   ├── cli/
│   ├── providers/
│   │   └── github/
│   ├── context/
│   ├── state/
│   └── skill/
├── schemas/
├── templates/
├── docs/
├── examples/
├── LICENSE
├── README.md
└── CONTRIBUTING.md
```

MIT licensed.

This repository contains generic functionality only.

### Private organization repository: `minizap-online/company`

```text
company/
├── COMPANY.md
├── AUTHORITY.md
├── ASSETS.md
├── DEVBOX.md
├── roles/
├── processes/
├── platforms/
├── policies/
├── projects/
└── templates/
```

This contains the desired state and curated knowledge of the actual MiniZap organization.

Never require MiniZap-specific knowledge in the MZ source repository.

---

# 5. Source-of-truth architecture

Use different storage mechanisms for different classes of information.

## 5.1 Git = curated desired state and durable knowledge

Git is authoritative for information that benefits from review, history, diffing, and intentional change.

Store in the private `company` repository:

- company principles
- roles
- capabilities/policies
- workflows/processes
- platform definitions
- asset inventory
- project specifications
- architecture
- ADRs/decisions
- threat models
- project security policies
- project privacy policies
- operations/runbooks
- current curated project status
- context summaries

Typical project directory:

```text
projects/<project>/
├── PROJECT.md
├── STATUS.md
├── ARCHITECTURE.md
├── DECISIONS.md
├── THREAT_MODEL.md
├── SECURITY.md
├── PRIVACY.md
├── OPERATIONS.md
└── project.yaml
```

Git should **not** contain:

- credentials
- access tokens
- raw operational logs
- high-volume event streams
- monitoring samples
- sensitive user feedback unless deliberately curated
- transient agent run data

---

## 5.2 Runtime state = small operational database

Use SQLite for the first implementation.

The database stores changing operational state:

- inbox records
- events
- agent/human runs
- interaction summaries
- source references
- external work-item mappings
- metric samples
- incidents
- feedback metadata
- capability requests
- audit records

Suggested initial tables:

```text
inbox_items
projects
events
runs
interactions
incidents
feedback
external_refs
metric_samples
capability_requests
```

### Recommended location

Do **not** make the Devbox VM the authoritative home of the organization database.

For v0:

```text
Root-server host / control-plane service
└── /srv/mz/state/mz.sqlite3
```

This is logically outside the disposable worker VM.

A new server is not required yet. The separation is logical:

```text
control plane
  owns state + credentials

devbox
  executes work
```

If MZ later moves to another host or managed database, the storage adapter should make that migration uninteresting.

### SQLite access model

Prefer one MZ Core service as the only writer.

```text
CLI / Skill / Web
       │
       ▼
    MZ Core
       │
       ▼
    SQLite
```

Workers should not open the database directly.

Enable WAL mode and transactions, but keep the schema simple.

---

## 5.3 Runtime-state backup is mandatory

The operational database must have a backup outside both the Devbox and the root server.

Minimal solution:

```text
SQLite online backup
    ↓
encrypted restic repository
    ↓
remote backup/object storage
```

The exact provider is configuration, not part of the MZ domain.

Minimum v0 requirements:

- automated backup
- encryption before/at backup storage
- backup destination physically/logically outside the root server
- periodic restore test
- `mz doctor` reports age of last successful backup
- backup success/failure becomes an MZ event

Suggested retention to begin with:

```text
14 daily
8 weekly
```

Do not optimize this until actual data volume exists.

---

# 6. Credential architecture

No credential values may be stored in:

- Git
- SQLite
- event logs
- prompts
- interaction transcripts

The database may store only symbolic references:

```yaml
credential_ref: github-app:minizap
```

or:

```yaml
credential_ref: dns:project-zone
```

## v0 secret provider

Implement a small `SecretProvider` interface.

Example:

```ts
interface SecretProvider {
  resolve(ref: SecretRef): Promise<SecretHandle>;
}
```

The first provider may use host-controlled secret files or systemd credentials.

Requirements:

- owned by the MZ control-plane account/root
- restrictive filesystem permissions
- never mounted wholesale into worker workspaces
- only required values are injected into a specific action
- values are redacted from logs

Later providers could include Vault, SOPS-backed configuration, cloud secret stores, etc. Do not implement them now.

### Preferred token model

Where possible, MZ should exchange long-lived organization credentials for short-lived project-scoped credentials.

Examples:

```text
GitHub App installation token
temporary deployment token
restricted DNS token
```

---

# 7. Authority model

MZ is autonomy-first inside a predefined boundary.

Typical default:

```text
code.write             agent
issues.write           agent
merge.main             agent
deploy.production      agent
project.secrets        agent
project.dns            agent

permission.expand      human
org.permissions        human
money                  human
external.communication human
```

Invariant:

> No actor may increase its own authority.

A child/worker may not receive more authority than the actor spawning or assigning it unless a human explicitly changes the organizational policy.

```text
child capabilities ⊆ authorized project/role capabilities
```

Enforcement must happen outside the model prompt.

`AGENTS.md` may explain policy, but policy must be checked by MZ/provider adapters.

---

# 8. Processes are first-class context

Processes/workflows are part of company knowledge and must be available to workers.

Store them in:

```text
company/processes/
```

Initial process definitions:

```text
intake.md
project-activation.md
development.md
release.md
security-review.md
privacy-review.md
incident-response.md
feedback-triage.md
organization-change.md
worker-onboarding.md
worker-offboarding.md
```

A role declares which processes normally apply:

```yaml
role: developer

processes:
  - development
  - release
  - incident-response
```

A task may add process context:

```yaml
task:
  kind: incident
  processes:
    - incident-response
```

The Context Compiler must include only relevant workflows, not the whole company handbook.

---

# 9. Context architecture

Never feed the entire organization into Codex.

Context is assembled from layers:

```text
company essentials
+ role contract
+ relevant processes
+ project brief
+ project architecture/status
+ relevant policies
+ relevant decisions
+ current task
```

A generated context bundle may look like:

```text
.mz/context/<run-id>/
├── 00-company.md
├── 10-role.md
├── 20-processes.md
├── 30-project.md
├── 40-status.md
├── 50-policies.md
├── 60-decisions.md
└── 90-task.md
```

Historical interaction data is **retrieved only when useful**.

The normal developer should not receive:

- all old chats
- raw event history
- other projects
- unrelated company discussions

---

# 10. Intake is the organization entry point

Do not make `mz new` the primary entry point.

Ideas can originate from:

- ChatGPT discussions
- a Markdown document
- a human note
- user feedback
- an existing GitHub issue
- an agent observation
- an organizational discussion
- a future integration

All of these become **Inbox items**.

Concept:

```text
source
  ↓
MZ intake
  ↓
Inbox
  ↓
triage
 ┌┴────────────────┐
 │                 │
project          company
candidate        improvement
 │                 │
activate          proposal
```

An inbox item contains:

```yaml
id: inbox-123
source_type: file
source_ref: ./idea.md
scope: unclassified
summary: ...
created_by: peter
```

The source artifact itself may remain where it came from. MZ stores a reference and a normalized summary.

### First useful command

```bash
mz ingest idea.md
```

or:

```bash
cat idea.md | mz ingest -
```

Optional:

```bash
mz ingest idea.md --scope company
mz ingest idea.md --scope project:otto
```

This is more important than an interactive `mz new` wizard.

---

# 11. Project activation

Project creation is a security-boundary operation and should remain explicitly authorized by a human.

An inbox item can become a project candidate.

Example:

```bash
mz project activate inbox-123
```

Activation may create:

- project ID
- company-project directory
- Git repository
- GitHub Project linkage
- initial role assignments
- capability profile
- workspace
- initial status
- required assurance work items

Required baseline checks for a new project:

```text
project definition
architecture baseline
threat model
security policy
privacy assessment
operations/monitoring baseline
```

These may be performed by agents, but the project boundary itself is established by a human-authorized activation.

---

# 12. Roles to support in the organization model

MZ core must not hard-code roles. Roles are organization configuration.

The initial MiniZap organization is expected to define:

- Project Steward
- Developer
- Security Reviewer
- Privacy Reviewer
- Support / Operations

The last three are shared assurance/operations roles and may serve multiple projects.

---

# 13. Independent security and privacy review

Every project has its own security and privacy artifacts.

Security review must not simply reuse the developer's conclusions.

Required project artifacts:

```text
THREAT_MODEL.md
SECURITY.md
PRIVACY.md
```

### Security Reviewer

Expected outputs:

- project-specific threat model
- trust boundaries
- assets
- attack surfaces
- misuse cases
- required mitigations
- residual risks
- security backlog items

Trigger review on:

- project activation
- before public launch
- material architecture changes
- new external integration
- new data class
- security incident

### Privacy Reviewer

Expected outputs:

- data inventory
- purpose of processing
- retention
- user-visible privacy implications
- third-party processors/integrations
- deletion/export requirements where relevant
- privacy backlog items

Trigger review on:

- project activation
- introduction of user-identifiable data
- new analytics/telemetry
- public feedback collection
- new third-party service

MZ itself should schedule/track these work items; it should not pretend to replace professional legal advice where that becomes relevant.

---

# 14. Support / Operations role

Start with a narrow first-level support role.

Purpose:

> Observe production, apply approved low-risk remediation, and escalate problems with useful context.

Capabilities may include:

```text
monitor.read
healthcheck.run
service.restart
deployment.rollback
logs.read.project
incident.create
issue.create
```

Initially exclude arbitrary infrastructure expansion.

The role should work from runbooks in `OPERATIONS.md`.

Example behavior:

```text
alert
  ↓
support agent investigates
  ↓
known runbook?
 ┌───────┴────────┐
 yes              no
  │                │
remediate      incident + escalation
  │
verify
  │
event + close
```

This role becomes more autonomous only when repeated incidents justify additional runbooks.

---

# 15. Provider architecture

GitHub is the first provider because time to market matters.

Do not leak GitHub-specific objects throughout the domain model.

Suggested interfaces:

```ts
interface SourceControlProvider { ... }
interface WorkProvider { ... }
interface DeploymentProvider { ... }
```

Domain references should look like:

```yaml
provider: github
kind: issue
external_id: "142"
url: ...
```

First implementation:

```text
providers/github
```

Future implementations may include:

```text
providers/gitlab
providers/codeberg
```

Do not implement them until required.

---

# 16. MZ as a Skill

MZ should ship a thin first-party skill.

```text
packages/skill/
└── SKILL.md
```

The skill is **not** a second implementation of MZ.

It teaches an agent to use the MZ interface correctly.

The skill should instruct the agent to:

1. identify current project/role
2. obtain context through MZ
3. inspect inbox/work through MZ/provider references
4. record decisions/events through MZ
5. never bypass capability enforcement
6. never read the runtime database directly
7. never persist credentials in project content
8. finish work with a handover

Useful commands exposed to the skill:

```text
mz context
mz status
mz inbox
mz decision
mz event
mz handover
```

The same underlying API should later serve CLI, skill, and web UI.

---

# 17. CLI v0

Implement only commands that enable the first real project.

## Required

```bash
mz doctor
mz ingest
mz inbox
mz status
mz context
mz ask
```

### `mz doctor`

Checks:

- company repo available
- runtime store available
- backup freshness
- Git provider authentication
- Codex available
- tmux available
- Devbox requirements
- secret provider configured
- no obvious secret values in config

### `mz ingest`

Creates an inbox item from stdin or a file.

### `mz inbox`

Lists/triages intake.

### `mz status [project]`

Summarizes current organizational/project state.

### `mz context`

Builds a bounded context package for project + role + task.

### `mz ask`

Starts or invokes the project steward using compiled context.

## Later

```bash
mz project activate
mz work
mz steering
mz incident
mz feedback
```

Do not block the first pilot on these if a manual equivalent is sufficient.

---

# 18. Event model

Important organization events should be append-only.

Initial event types:

```text
inbox.created
inbox.triaged

project.proposed
project.activated
project.archived

decision.recorded

work.started
work.completed
work.blocked

pr.created
merge.completed

deploy.started
deploy.completed
deploy.failed
deploy.rolled_back

incident.opened
incident.remediated
incident.escalated
incident.closed

security.reviewed
privacy.reviewed

human.intervention
context.miss

capability.denied
capability.requested
capability.changed

backup.completed
backup.failed
```

Event payloads should be small and structured.

Do not put raw transcripts or secrets in event payloads.

---

# 19. Interaction memory

Project workers need continuity without permanent sessions.

Store:

1. raw source reference where appropriate
2. concise interaction summary
3. decisions extracted from the interaction
4. follow-ups / work items
5. project/company scope

Example:

```yaml
interaction:
  scope: project:example-game
  source: chat
  summary: >
    The owner chose scripted drawer behavior for the first prototype.
  decisions:
    - ADR-014
  follow_ups:
    - issue-82
```

Curated decisions move into Git.

The runtime database retains the historical interaction record.

---

# 20. Handover contract

Every worker run that changes project state should finish with:

```text
Completed
Changed
Decisions
Follow-ups
Risks
References
```

MZ converts this into:

- events
- status updates
- proposed knowledge changes
- work items where appropriate

A new worker session must be able to continue without access to the previous model session.

---

# 21. First metrics

Do not measure productivity by commits, token usage, or number of tickets.

Track organization quality:

```text
context_miss
human_intervention
cycle_time
blocked_age
reopen_rate
rollback_rate
capability_request_rate
incident_count
incident_mttd
incident_mttr
auto_remediation_success
backup_age
```

Metrics are observations, not targets, until a baseline exists.

---

# 22. Web UI

Do not build before the CLI works.

The target is a private organizational interface; configure its deployment address in the private company repository.

Views:

```text
Projects
Inbox
Needs Human
Current Work
Incidents
Decisions
Activity
Metrics
Terminal
```

Terminal integration may connect to existing tmux sessions.

The web UI must use the same MZ Core API as CLI and Skill.

No duplicate business logic.

---

# 23. The organization website is just another project

The public MiniZap identity/web presence is not special infrastructure in the organization model.

Treat it as:

```text
project: organization-web
```

It receives:

- project context
- security/privacy review
- normal development workflow
- deployment
- monitoring
- support
- feedback intake

This is an important architectural test: MZ should manage its own organization's public site the same way it manages games.

---

# 24. Project plan / milestones

## Milestone 0 — Bootstrap the two repositories

Create:

```text
minizap-online/mz       public, MIT
minizap-online/company  private
```

Add skeleton organization files.

**Done when:** the organization can be described without reading MZ source code.

---

## Milestone 1 — Core domain and state boundary

Implement:

- config loading
- company repository discovery
- SQLite state adapter
- secret-reference model
- provider interfaces
- GitHub provider skeleton
- event model
- `mz doctor`

Implement backup command/hook and backup-health check.

**Done when:** MZ can safely open its company config and runtime state without storing credentials in either.

---

## Milestone 2 — Intake and Inbox

Implement:

```text
mz ingest
mz inbox
```

Accept Markdown from stdin/file.

Support scopes:

```text
unclassified
company
project-candidate
project:<id>
```

This should be the **first end-user feature**.

**Done when:** a Markdown produced in a ChatGPT discussion can become an MZ inbox record without manually restructuring it.

---

## Milestone 3 — Context Compiler + MZ Skill

Implement:

```text
mz context
```

Combine:

- company essentials
- role
- processes
- project
- security/privacy/operations policy as relevant
- decisions
- task

Add `packages/skill/SKILL.md`.

**Done when:** a fresh Codex session can receive a bounded, useful project context without past chat history.

---

## Milestone 4 — Project Steward

Implement:

```text
mz status
mz ask
```

The steward should be able to:

- explain project state
- identify decisions needed
- triage inbox items
- propose work
- record decisions
- recommend knowledge updates

**Done when:** The owner can return days later and ask what is happening without reconstructing the project mentally.

---

## Milestone 5 — First pilot project

Take the next real MiniZap idea.

Flow:

```text
Markdown idea
→ mz ingest
→ steward triage
→ project candidate
→ human activation
→ project knowledge
→ threat model
→ security/privacy baseline
→ implementation
```

Use manual GitHub steps if automation is not yet justified.

**Rule:** do not pause the real project to perfect MZ.

Every missing MZ feature becomes an inbox item.

---

## Milestone 6 — Worker execution

Only after the pilot proves the context model.

Implement:

```text
mz work <work-item>
```

It should:

- identify role/project
- create/reuse workspace
- compile bounded context
- start/reuse tmux
- start Codex
- provide scoped authority
- capture handover

**Done when:** an issue can be completed without manual copy/paste of organizational context.

---

## Milestone 7 — Security, Privacy and Operations automation

Formalize the shared roles:

```text
security-reviewer
privacy-reviewer
support-operator
```

Add review triggers and runbooks.

Do not require a large scheduler. Start by creating normal work items/events.

**Done when:** every public project has independent threat/security/privacy review and basic monitoring ownership.

---

## Milestone 8 — Steering and organizational learning

Implement:

```text
mz steering
```

Use event data to report:

- project health
- human attention needed
- repeated organizational friction
- context misses
- capability pressure
- incidents
- repeated solutions

Consultant output must be advisory.

Organizational changes remain explicit decisions.

---

## Milestone 9 — Web UI

Build only after the CLI and organization model are proven.

Use the same MZ Core API.

---

# 25. First implementation tickets for Codex

Create these as the initial MZ backlog.

The tracked backlog is now in [docs/tickets/README.md](docs/tickets/README.md). MZ-001 through MZ-012 remain stable design references and map to FR-001 through FR-012. Follow [docs/workflow.md](docs/workflow.md) and [docs/milestones.md](docs/milestones.md).

## MZ-001 Repository bootstrap

- TypeScript project
- MIT license
- packages layout
- CLI entry point
- tests
- lint/format
- README

## MZ-002 Company repository loader

- locate/configure private company repo
- parse YAML/Markdown metadata
- no MiniZap-specific constants in core

## MZ-003 Runtime state adapter

- SQLite
- migrations
- event table
- inbox table
- run table
- WAL
- transactions
- no credentials

## MZ-004 Secret reference abstraction

- `SecretRef`
- local/system provider
- redaction helpers
- prohibit serialization of resolved secret values

## MZ-005 Backup and restore contract

- safe SQLite snapshot
- external backup hook
- backup event
- `mz doctor` backup-age check
- documented restore procedure

## MZ-006 Provider abstractions

- SourceControlProvider
- WorkProvider
- GitHub implementation skeleton
- provider-neutral external references

## MZ-007 `mz doctor`

Validate environment and report actionable failures.

## MZ-008 `mz ingest`

- file
- stdin
- source metadata
- scope
- summary placeholder
- event creation

## MZ-009 `mz inbox`

- list
- inspect
- classify
- assign scope
- mark triaged

## MZ-010 Context Compiler

- company
- role
- process
- project
- policy
- decision
- task
- deterministic output

## MZ-011 MZ Skill

Create a thin `SKILL.md` that uses MZ rather than bypassing it.

## MZ-012 Project Steward

Implement `mz status` and `mz ask`.

Stop here and start the pilot project before automatically continuing with more MZ functionality.

---

# 26. Codex implementation rules

Codex should follow these constraints while implementing MZ:

1. Prefer boring, inspectable TypeScript.
2. No framework unless a concrete requirement demands it.
3. No dependency on a particular LLM vendor in domain logic.
4. No dependency on GitHub in domain types.
5. No secrets in logs, DB fixtures, tests, or repository examples.
6. Every schema change gets a migration.
7. Every event is append-only.
8. Every provider action is auditable.
9. The Context Compiler is testable without calling an LLM.
10. Keep `mz` useful without the web UI.
11. Do not implement future milestones speculatively.
12. When a real pilot need conflicts with this document, create an explicit decision/ADR rather than silently broadening MZ.

---

# 27. v0 success condition

MZ v0 is successful when the following experience works:

```text
1. The owner develops an idea anywhere.
2. The idea exists as Markdown.
3. `mz ingest idea.md`
4. The Steward can discuss and structure it.
5. The idea becomes an authorized MiniZap project.
6. A fresh Codex worker gets the correct project + process context.
7. Project work can continue without The owner reconstructing old context.
8. Security, privacy and operational responsibilities are visible.
9. MZ records enough history to explain what happened.
10. The real game progresses faster than the MZ platform itself.
```

If MZ starts consuming more attention than the MiniZap products, reduce MZ scope.
