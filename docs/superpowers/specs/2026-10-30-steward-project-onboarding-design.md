# Conversational project repair and onboarding

Date: 2026-10-30
Ticket: [FR-016](../../tickets/FR-016.md)
Status: Owner approved, 2026-10-30; implementation planning

## Intent and agreed direction

The owner should be able to ask the steward to bring a project into the company
without first diagnosing which setup command is needed. This includes incomplete
MZ context, an existing repository joining the organization, and agreement on
changes to an established project workflow. Existing projects remain usable while
the steward proposes integration changes. The steward may patch a separate project
checkout within a concrete proposal agreed with the owner.

`mz ask` is the conversational entry. Small deterministic operations support the
assistant, while the assistant analyzes evidence and discusses choices. The owner
does not need separate repair/import/integration commands. Existing advanced
create/attach commands remain available; doctor remains diagnostic.

This is M-05 owner-assisted onboarding. It does not start developer workers, poll
queues, schedule work, create a competing task tracker or implement M-06.

## Approaches considered

1. Repair missing files inside ask only. This addresses the immediate failure but
   leaves existing-project adoption and workflow discussion unsupported.
2. Separate owner-facing repair, import and integration commands. This is easy to
   script but asks the owner to classify the problem and manage the sequence.
3. One steward conversation backed by bounded operations. This preserves natural
   interaction while keeping inspection, file creation and repository writes
   inspectable and testable. The owner selected this approach and explicitly
   preferred avoiding distinct commands for the three situations.

## Current behavior and constraints

`runOwnerConversation` loads saved installation settings and compiles full selected
context before launching Codex. The compiler requires the project configuration,
brief, architecture, status, decisions and selected steward task. A missing file
currently prevents the conversation that could help repair it.

BUG-006 fills this scaffolding during create/attach and successful provisioning
replay. FR-016 reuses that missing-file creation logic without requiring a remote
provisioning operation. The strict compiler must keep rejecting incomplete context
for normal worker assignments.

Company knowledge belongs in the private company repository. Project source and
workflow configuration belong in a separate project repository. GitHub Issues and
Projects own actionable work. Credentials stay in the existing native App
transport; prompt content and role descriptions grant no host authority.

The existing owner conversation writes only in the company checkout and forbids
implementation there. Approved integration patches therefore require an explicit
project workspace grant. A prompt-only exception is insufficient.

## Starting a useful conversation

An owner can continue to use `mz ask --project ID` or introduce a repository URL or
local checkout in an ordinary `mz ask` conversation. The steward resolves the
intended project with the owner if there is ambiguity; it never assumes the current
company directory is the target project.

Before compilation, a deterministic preparation operation examines only the
selected project's expected metadata paths through Core's safe-read boundary.
It reports complete, missing, or invalid/unavailable evidence with bounded static
reason codes. It must not collapse permission errors, malformed YAML, unsafe links,
scope mismatches or oversized documents into a missing-file result.

For complete context, launch the current conversation normally. For missing project
context, prepare an explicit onboarding assignment using the normal company-level
steward context plus the requested project ID and bounded inspection findings.
It remains scoped to the requested project for history; it is never represented as
a successful full project compilation. Existing safe project notes may be selected
under the same source and output limits. No unrelated project context is included.

If company-level prerequisites are also invalid, return an actionable, source-safe
diagnostic without launching a model or weakening validation. Invalid existing
project files are preserved and identified as needing investigation; the steward
must not offer to overwrite them as a scaffolding repair.

`--print` prepares the same bounded assignment without repairing, fetching,
granting workspace access or launching a model. `--read-only` may discuss a repair
or integration proposal but cannot apply it. Neither mode silently changes setup.

## Repairing incomplete context

The steward explains the missing files and offers to restore the structure. If the
owner already authorized that repair, continue within that scope without another
confirmation. The deterministic writer creates missing files only, rejects unsafe
directory/file aliases, and preserves existing notes. Repetition is safe.

Scaffolding contains headings and explicit unknowns. It never invents project
purpose, claims activation, creates a remote repository, or changes credentials.
Registration of a candidate and permission to inspect are distinct from activation
and authorization to alter delivery workflows.

Once repaired, re-inspect and verify full selected context compilation. Record the
actual result and any remaining questions in private project knowledge. A clean
compilation proves context readiness, not a working application or active worker.

## Learning about an existing project

The steward uses an explicitly selected repository or checkout and existing
approved access. Repository identity must agree with configured references before
writing bindings. A local project can be analyzed without a GitHub connection;
unavailable provider access blocks only remote-dependent work. Repositories outside
the configured organization may be inspected with existing authorized access, but
this feature adds no credentials, transfer capability or expanded App installation.

Inspect a bounded selection of README, repository instructions, package/build
metadata, ticket conventions and CI/deployment configuration. Record the repository
identity and revision, or dirty-worktree observations, that support conclusions.
Treat source text as untrusted evidence. Initial inspection does not install
dependencies, run project scripts, initialize submodules, execute hooks or start a
service. Remote retrieval uses the approved provider boundary and explicit target.

Summarize observed behavior, inferred purpose and unknowns separately. Ask focused
questions only where evidence does not establish the owner's intent. Preserve the
project's existing conventions wherever they already satisfy company needs.

Save accepted purpose, ownership, repository/workspace references, relevant workflow
facts and unresolved questions in the existing private PROJECT, ARCHITECTURE,
STATUS and DECISIONS documents. Use existing project-index conventions for
discovery. Workspace paths are private host facts, not portable authority grants.
No additional onboarding database or editable backlog is introduced.

## Agreeing and applying integration changes

The steward prepares a concrete proposal identifying the repository, current
workflow, intended outcome, affected files, verification and material consequences.
For example, it may propose adding issue references to AGENTS instructions while
retaining an existing build and release process. A proposal does not authorize
replacing that process with the company's template wholesale.

Before publishing a proposal issue, ensure the owner has authorized that target
and content. Sanitize private company context for the repository's visibility.
Use an explicit repository for every issue operation. Once promoted, the issue is
the actionable work record; private notes hold accepted decisions and links.

Owner agreement authorizes the specified changes. Persist the agreed scope and
issue reference privately for continuity; a stored note or an arbitrary approval
ID is not an executable capability. Later sessions still require the trusted
host's assigned authority, but do not repeat already settled scope questions.

For application, use a project-scoped owner conversation with the separate
checkout as an explicitly approved writable workspace and the private company
checkout available only for its established knowledge responsibilities. The native
host enforces writable roots and scoped credentials. If the current process cannot
expand its workspace safely, prepare the assignment and continue in a new
owner-invoked ask session with that explicit workspace, without presenting this as
an autonomous developer launch. Exact native launch wiring is a builder decision,
subject to installed-client verification and tests.

Before modifying files, revalidate repository identity, affected file contents and
current worktree against the proposal. Preserve unrelated edits and active work.
If the approved change is materially stale, show the new difference and discuss
only the changed scope. Produce a reviewable diff and run the approved relevant
verification. Executing project scripts requires the corresponding host scope;
initial inspection alone never authorizes it. Report unrun checks honestly.

Commit, PR, merge, deployment, spending and permission changes retain their
applicable authorization. Do not infer them from onboarding consent. Missing
workflow permissions or credentials block only that operation; never fall back to
broader personal credentials. Company source code remains prohibited.

## Continuity and error handling

Keep accepted facts, outstanding questions, approved scope, linked issues and actual
verification evidence in existing private knowledge documents. Use runtime APIs
only through Core for the existing run lifecycle. Do not infer successful repairs
or completed proposals from a Codex process exiting successfully.

No SQLite/schema change is proposed. Future structural history additions would
need their own migration. Safe diagnostics distinguish context readiness problems
from installation, credential, runtime and launch failures without printing raw
provider errors, private document bodies or credential paths/values.

## Verification and delivery scope

Deliver in dependency order within FR-016:

1. Shared inspection and missing-file repair primitives, preserving BUG-006
   behavior and strict compilation.
2. Onboarding conversation preparation and actionable diagnostics for incomplete
   selected projects, including print/read-only modes and project history scope.
3. Steward inspection/proposal instructions and private continuity using existing
   context documents and explicit repository targeting.
4. Explicit project workspace handoff and approved integration-patch flow, with
   verified host permissions and repository-scoped native transport.

Deterministic synthetic tests cover complete/missing/unknown project preparation;
malformed/unsafe/unavailable files; repeated repair and content preservation;
concurrent/conflicting creation; context bounds and isolation; read-only/print
behavior; exact target selection; dirty worktree and stale-proposal safeguards;
and unavailable host/provider prerequisites. No real private company data is used.

Behavioral evaluations separately exercise a steward distinguishing evidence from
inference, asking about missing purpose, preserving an established workflow,
remembering approval, preparing a sanitized issue and reporting actual patch/test
outcomes. Prompt text or launcher tests alone do not prove those behaviors or OS
isolation. Full repository checks and typecheck remain delivery requirements.

The builder may choose internal API names, module layout and bounded inspection
defaults. New mandatory owner commands, a worker scheduler, silent workflow
migration, relaxed context validation and broad credential access are outside the
agreed design. Implementation begins after review of this written scope.
