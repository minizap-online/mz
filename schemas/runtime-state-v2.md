# Runtime state schema v2

FR-005 adds [002-backups.sql](../packages/state/migrations/002-backups.sql) after the immutable [schema v1 migration](runtime-state-v1.md). The existing migration identity, checksum, schema verification and atomic upgrade rules continue to apply. Existing v1 records and append-only events are preserved; historical event backup references are null.

| Change             | Contract                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `backups`          | UUID identity, destination UUID, actor UUID, start UTC timestamp, nullable finish timestamp/outcome, encrypted acknowledgement |
| `events.backup_id` | Nullable foreign key to `backups.id`; backup result events link the durable attempt                                            |

A pending backup has null finish/outcome/acknowledgement. A terminal backup has finish at or after start and outcome `succeeded` or `failed`. Only success has encrypted acknowledgement 1; other states require null. The STRICT table contains structural metadata only, without artifact paths, receipts, credentials or provider errors.

Core persists the pending attempt before copying. A terminal update and its backup.completed/backup.failed event commit together; finalization happens once. State read methods expose history, conservative data freshness, and integrity verification. The adapter's private connection integration supplies native snapshots and backup writes to Core; workers receive no raw connection or backup mutator in a transaction.

Freshness selects the successful snapshot with the newest start timestamp and computes age from that start, not upload completion. The latest attempt is independently visible. A snapshot contains its pending marker but cannot contain its subsequent completion event. See [backup contract and restore procedure](../docs/backups.md).

Tests open an actual migration-001 database with existing run/event data and upgrade it to v2, exercise failed upgrade rollback, and restore encrypted synthetic snapshots after deleting the original source. Production recovery remains an operational responsibility.
