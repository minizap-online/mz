# Markdown intake

FR-008 implements `mz ingest FILE` and `mz ingest -`. It copies untrusted UTF-8 Markdown into private host source storage and atomically creates an inbox record, structural intake metadata and an inbox.created event. It does not invoke a model, execute document instructions/front matter, publish an issue, classify/triage the item, activate a project or grant authority.

## Host configuration and usage

Use a valid private company repository, an existing persistent runtime database, an assigned actor UUID and a pre-created private source directory **outside Git** and disposable worker storage. No implicit source directory or actor is invented. Company discovery follows [the loader](company-repository.md). Core `openRuntimeState({path, existingOnly:true})` is used: missing, zero-byte, uninitialized SQLite and foreign files are rejected before initialization or WAL changes; explicitly selected recognized older databases may be upgraded by Core before import. Coordinate restores/migrations/file replacement with running jobs. Host file layout is trusted configuration, not a sandbox against an administrator concurrently replacing it.

```sh
export MZ_COMPANY_DIR=/absolute/private/company
export MZ_RUNTIME_DB=/absolute/control-plane/state.sqlite3
export MZ_SOURCE_DIR=/absolute/control-plane/private-sources
export MZ_ACTOR_ID=11111111-1111-4111-8111-111111111111 # Example: use the assigned identity.
mz ingest idea.md
cat idea.md | mz ingest - --scope company
mz ingest idea.md --scope project:example-project --json
```

| Flag                     | Environment fallback / contract                                                   |
| ------------------------ | --------------------------------------------------------------------------------- |
| `--company DIR`          | `MZ_COMPANY_DIR`, then normal company discovery; relative explicit paths allowed  |
| `--runtime FILE`         | `MZ_RUNTIME_DB`; existing regular absolute runtime file                           |
| `--source-directory DIR` | `MZ_SOURCE_DIR`; pre-created private absolute source directory outside Git        |
| `--actor UUID`           | `MZ_ACTOR_ID`; stable assigned canonical lowercase UUID                           |
| `--scope SCOPE`          | Default `unclassified`; accepts `company`, `project-candidate`, `project:<id>`    |
| `--json`                 | Generated identities/structural result; no raw text, source path or original name |
| `--help`, `-h`           | Help without reading a source or requiring configuration                          |

Flags override environment values. Project IDs use 1–64 lowercase ASCII letters/digits/hyphens, starting with a letter. Scope is metadata only; it does not verify existence or activation of a project. Repeated/unknown options, missing settings/values, invalid UUIDs/scopes and multiple input files fail safely. For a filename beginning with a dash, use a relative path such as `./-idea.md`.

Exit 0 means import completed; 1 means source/configuration/storage/state failed; 2 means invalid invocation. Errors withhold source content, rejected arguments, file names/paths and underlying exception messages. If final database close fails after a commit, the CLI reports uncertainty and asks the operator to inspect committed history before retrying. It does not falsely claim rollback. Text output reports the generated inbox/source IDs, kind, byte count, scope and “Summary pending.” JSON returns the same structural Core result. Input is not printed.

## Input and privacy rules

Input must be nonempty valid UTF-8, at most 1 MiB, and contain no NUL bytes. Whitespace-only UTF-8 is retained as data. Original bytes, BOM and line endings are preserved. Files must be regular and final-component nonsymlinks; nonblocking/O_NOFOLLOW descriptor reads reject pipes, devices, directories and links without interpreting content. File growth is bounded by the read limit. Stream chunks must be byte arrays; a fixed input buffer bounds retained memory even with empty/tiny chunks. Stdin requires EOF; interrupt an unfinished producer normally. File/stream contents are not an atomic snapshot of a concurrently mutating producer.

The source directory follows the shared protected host ownership/ancestor rules: a real 0700 directory owned by the effective UID or root. Recognized Git ancestors are rejected, including `.git` directories/files and bare layouts with HEAD/objects/refs. Canonical paths are checked; do not later move the source store into Git or configure an external Git worktree around it. Host administrators and trusted iterator code remain trusted. Every source gets a new exclusive UUID directory (0700), `content.md` and `metadata.json` (0600). The original file is never edited or deleted.

The manifest is private and may contain the original **basename**, never the original path. Core return values, SQLite and events contain only structural identities and bounded source metadata; no raw text, source names, paths or input-derived summaries. Do not ingest credentials. Host source files are private intake, not a credential store. The summary is a fixed placeholder and needs no LLM call.

Read [private intake retention and promotion](intake-storage.md) before deployment. Copies are retained until explicit operator removal; no purge or publication happens automatically. Triage, review and deliberate sanitized promotion are separate from ingest. Keep source-store backups encrypted and independent of worker loss. SQLite snapshots preserve the references/metadata, not the raw host source files; recovery requires both stores.

## Atomicity and recovery

Core validates the known state, actor, scope and source shape before reading input. It verifies private storage, then reads/validates bounded bytes. It creates and synchronizes owned source files/directories before the SQLite transaction. Inbox creation, optional intake metadata and the automatically generated created event commit together; returned metadata is read inside that same transaction. Any failed SQL operation rolls back all three. Owned source files are removed on failure, with inode/device ownership checks before recursive cleanup. Existing unrelated files are not removed.

There is no cross-store distributed transaction. A process/storage failure before SQL commit can leave a private partial/orphan directory. Use the manifest's intended item UUID to reconcile with Core; inspect incomplete folders manually. Do not delete a directory belonging to an active attempt. A cleanup error is reported explicitly; losing the original input or source disk is not repaired by SQLite metadata. Restore/cutover procedures must coordinate writers and matching source data.

## Core API and schema

Core exports `ingestMarkdown({state, sourceDirectory, actorId, scope?, source})`. Source is `{type:'file', path:absolutePath}` or `{type:'stdin', stream:AsyncIterable<Uint8Array>}`. The stream implementation is trusted host code; its yielded bytes are untrusted data. The result is `{item, intake, summary:'Summary pending', untrusted:true}`. A supplied state must be an actual Core instance. `IntakeError` exposes only static messages/codes for invalid options, unsafe storage, source read/write, size/encoding, transaction and cleanup failures; it retains no original cause.

[Migration 003/schema v3](../schemas/runtime-state-v3.md) adds `inbox_intake` keyed by the existing item. Existing InboxItem records/shape remain compatible. `createInboxItem` optionally accepts `{intake:{sourceType, sourceBytes, scope?}}`; Core/transaction `getInboxIntake(id)` returns its structural metadata or null for older items. Summary status is fixed `pending`. The schema has no arbitrary summary/content/path field. Later triage remains FR-009.

Tests use synthetic content and temporary private directories. They verify actual file/stdin byte copies and metadata, all scope categories, exact/oversize/invalid input, nonblocking FIFO rejection, links/permissions/Git boundaries, safe errors/output, source-write and SQL audit rollback/cleanup, real v2 history preservation, CLI/environment behavior, and fresh installed entry points from another directory. No real intake, production source-store backup, remote publication, project activation or organization retention deployment is claimed.
