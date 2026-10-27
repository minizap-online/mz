# Architecture and authority

## Bootstrap boundary

M-00 contains an npm workspace with ESM TypeScript packages and a CLI originally supporting help/version; FR-007 adds diagnostic doctor. Core now provides the FR-002 read-only company loader; FR-003 adds SQLite through Core; context remains a placeholder; FR-006 adds neutral provider contracts in Core and an offline GitHub skeleton with an injected audit contract. See [providers](providers.md). The CLI reads its own package metadata relative to the executable, works from an unrelated directory, and requires no company or runtime initialization.

Core will own domain types, capabilities, and access to runtime state. CLI, context compilation, state adapters, and providers remain separate packages. Provider and LLM details must not enter the domain. The worker skill will call MZ rather than duplicate its logic.

## Sources of truth (CR-002)

| Information                                                              | Authority                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------- |
| Actionable work, priority, milestone, board status                       | GitHub Issues and Projects                        |
| Curated company/project knowledge, decisions, policies                   | Git repositories; organization content is private |
| Execution history, append-only events, runs, source references, mappings | SQLite accessed through Core, implemented in M-01 |

SQLite must not become a parallel editable task tracker. Runtime records may cache references or observations but cannot override provider work status. Curated project status summarizes evidence and links issues rather than duplicating an editable board.

Before M-02 implementation, define private intake retention and promotion explicitly. Raw intake and untrusted feedback remain private. Triage may deliberately promote a sanitized work item to an issue and record the link; ingest alone never publishes content or grants authority. Public implementation issues contain generic, reusable work only. Company planning and organizational discussions belong in the private company repository and private planning board.

Project activation, organizational authority changes, and spending retain human authorization. Routine work inside approved project capabilities can proceed autonomously. A worker may never grant itself new authority.

## Secrets and durability

Persist symbolic secret references only. Credential values must never enter Git, SQLite, logs, fixtures, or examples. The control plane will resolve secrets for scoped operations. Runtime data must survive worker loss and have independently verified encrypted backups and restoration. FR-003 implements typed structural runtime history, migrations, WAL, and transactions. FR-004 adds host-file secret resolution through opaque scoped handles and diagnostic redaction. FR-005 adds native snapshots, a trusted external encrypted-storage hook, durable backup health and fixture restoration; live off-host deployment remains separately required. See [backups and restoration](backups.md). See [runtime state](runtime-state.md) and [secret handling](secrets.md).

## Manual company scaffolding

`templates/company/company.yaml` uses the initial parsed company schema. The other files remain documentation scaffolding, not an enforced capability model. Copy into a separate private repository, replace placeholders, and review authority with the owner. The read-only [Core loader](company-repository.md) supports selected metadata reads; no activation command exists yet.

## Environment diagnostics

FR-007 adds [doctor](doctor.md), including read-only existing-state inspection through Core, shared backup data-age policy, explicit host-secret access checks, worker prerequisites and opt-in GitHub identity probing. An offline/unavailable integration remains unavailable. Diagnostics do not initialize or migrate stores, repair configuration, provision credentials or grant authority.
