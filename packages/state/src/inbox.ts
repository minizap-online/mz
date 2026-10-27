import type { DatabaseSync } from 'node:sqlite';
import type {
  InboxDetails,
  InboxTriageChange,
  InboxCursor,
  InboxHistoryCursor,
  TriageInboxItem,
  InboxClassification,
} from './inbox-types.js';
import { INBOX_CLASSIFICATIONS } from './inbox-types.js';
import type { InboxIntake } from './intake-types.js';
import {
  cursor,
  invalid,
  inboxScope,
  newId,
  record,
  timestamp,
  uuid,
} from './records.js';
import {
  RuntimeStateError,
  type NewRuntimeEvent,
  type RuntimeEvent,
} from './types.js';
const CHANGE_QUERY =
  'SELECT sequence, id, inbox_item_id AS inboxItemId, revision, actor_id AS actorId, changed_at AS changedAt, classification, scope, triaged, event_id AS eventId FROM inbox_triage_changes';
function change(row: Record<string, unknown>): InboxTriageChange {
  return {
    ...row,
    triaged: row['triaged'] === 1,
  } as unknown as InboxTriageChange;
}
export function parseInboxClassification(value: unknown): InboxClassification {
  if (
    typeof value !== 'string' ||
    !(INBOX_CLASSIFICATIONS as readonly string[]).includes(value)
  )
    return invalid('classification');
  return value as InboxClassification;
}
export function getInboxDetails(
  db: DatabaseSync,
  input: string,
): InboxDetails | null {
  const id = uuid(input, 'id');
  const row = db
    .prepare(
      'SELECT rowid AS sequence, id, source_id AS sourceId, received_at AS receivedAt FROM inbox_items WHERE id = ?',
    )
    .get(id);
  if (!row) return null;
  const intakeRow = db
    .prepare(
      'SELECT inbox_item_id AS inboxItemId, source_type AS sourceType, source_bytes AS sourceBytes, scope, created_by AS createdBy, summary_status AS summaryStatus FROM inbox_intake WHERE inbox_item_id = ?',
    )
    .get(id);
  const intake = intakeRow
    ? ({ ...intakeRow } as unknown as InboxIntake)
    : null;
  const latest = db
    .prepare(
      CHANGE_QUERY + ' WHERE inbox_item_id = ? ORDER BY revision DESC LIMIT 1',
    )
    .get(id);
  const lastChange = latest ? change(latest) : null;
  return {
    sequence: Number(row['sequence']),
    item: {
      id: String(row['id']),
      sourceId: String(row['sourceId']),
      receivedAt: String(row['receivedAt']),
    },
    intake,
    classification: lastChange?.classification ?? 'unclassified',
    scope: lastChange?.scope ?? intake?.scope ?? 'unclassified',
    triaged: lastChange?.triaged ?? false,
    revision: lastChange?.revision ?? 0,
    lastChange,
    sourceRef: 'private-source:' + String(row['sourceId']),
    summary: 'Summary pending',
    untrusted: true,
  };
}
export function listInbox(
  db: DatabaseSync,
  input: InboxCursor = {},
): InboxDetails[] {
  const page = cursor(input);
  const rows = db
    .prepare(
      'SELECT id FROM inbox_items WHERE rowid > ? ORDER BY rowid LIMIT ?',
    )
    .all(page.afterSequence, page.limit);
  return rows.map((row) => getInboxDetails(db, String(row['id']))!);
}
export function listInboxChanges(
  db: DatabaseSync,
  input: InboxHistoryCursor,
): InboxTriageChange[] {
  const values = record(input, ['inboxItemId', 'afterSequence', 'limit']);
  const id = uuid(values['inboxItemId'], 'inboxItemId');
  if (!getInboxDetails(db, id))
    throw new RuntimeStateError(
      'INBOX_NOT_FOUND',
      'The inbox item does not exist.',
    );
  const page = cursor({
    afterSequence: values['afterSequence'],
    limit: values['limit'],
  });
  return db
    .prepare(
      CHANGE_QUERY +
        ' WHERE inbox_item_id = ? AND sequence > ? ORDER BY sequence LIMIT ?',
    )
    .all(id, page.afterSequence, page.limit)
    .map(change);
}
export function triageInboxItem(
  db: DatabaseSync,
  input: TriageInboxItem,
  append: (event: NewRuntimeEvent) => RuntimeEvent,
): InboxDetails {
  const values = record(input, [
    'id',
    'actorId',
    'classification',
    'scope',
    'triaged',
    'changedAt',
  ]);
  const id = uuid(values['id'], 'id');
  const actorId = uuid(values['actorId'], 'actorId');
  if (
    !['classification', 'scope', 'triaged'].some((key) =>
      Object.hasOwn(values, key),
    )
  )
    return invalid();
  const current = getInboxDetails(db, id);
  if (!current)
    throw new RuntimeStateError(
      'INBOX_NOT_FOUND',
      'The inbox item does not exist.',
    );
  const classification = Object.hasOwn(values, 'classification')
    ? parseInboxClassification(values['classification'])
    : current.classification;
  if (Object.hasOwn(values, 'scope') && typeof values['scope'] !== 'string')
    return invalid('scope');
  const scope = Object.hasOwn(values, 'scope')
    ? inboxScope(values['scope'])
    : current.scope;
  if (
    Object.hasOwn(values, 'triaged') &&
    typeof values['triaged'] !== 'boolean'
  )
    return invalid('triaged');
  const triaged = Object.hasOwn(values, 'triaged')
    ? (values['triaged'] as boolean)
    : current.triaged;
  const changedAt = timestamp(values['changedAt'], 'changedAt');
  if (
    classification === current.classification &&
    scope === current.scope &&
    triaged === current.triaged
  )
    return current;
  if (changedAt < (current.lastChange?.changedAt ?? current.item.receivedAt))
    return invalid('changedAt');
  const event = append({
    type: 'inbox.triaged',
    actorId,
    occurredAt: changedAt,
    inboxItemId: id,
  });
  db.prepare(
    'INSERT INTO inbox_triage_changes (id,inbox_item_id,revision,actor_id,changed_at,classification,scope,triaged,event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    newId(undefined),
    id,
    current.revision + 1,
    actorId,
    changedAt,
    classification,
    scope,
    triaged ? 1 : 0,
    event.id,
  );
  return getInboxDetails(db, id)!;
}
