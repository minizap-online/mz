# Runtime state schema v3

FR-008 adds [003-intake.sql](../packages/state/migrations/003-intake.sql) after immutable migrations [001](runtime-state-v1.md) and [002](runtime-state-v2.md). Existing inbox, backup, run and append-only event records remain unchanged. A real v2 fixture with linked inbox/backup/event history is upgraded and checked through Core.

New STRICT table `inbox_intake`:

| Column           | Contract                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `inbox_item_id`  | Primary key, foreign key to existing `inbox_items.id`                                                                           |
| `source_type`    | `file` or `stdin`                                                                                                               |
| `source_bytes`   | Integer 1–1048576                                                                                                               |
| `scope`          | `unclassified`, `company`, `project-candidate`, or `project:<id>` with a lowercase letter-leading 1–64 letter/digit/hyphen slug |
| `created_by`     | Assigned actor UUID, structurally validated through Core                                                                        |
| `summary_status` | Fixed `pending`; no arbitrary text/derived summary                                                                              |

Typed `createInboxItem` can atomically insert this optional metadata and the created event with its inbox row. `getInboxIntake(id)` returns detached metadata, including createdBy; legacy inbox rows have null metadata. Existing `InboxItem` shape is unchanged. No source text, paths, names, provider work status, credentials or command payloads enter this table. A reference is a source UUID, resolved only under explicit private host storage configuration.

The existing migration/checksum/schema/transaction rules continue. Doctor requires the current version and never upgrades; normal explicitly selected Core state opening performs supported upgrades. An input-derived summary or future triage schema change requires another migration. See [intake](../docs/intake.md) and [retention/promotion policy](../docs/intake-storage.md) for filesystem/SQLite commit ordering, crash reconciliation and backup limitations.
