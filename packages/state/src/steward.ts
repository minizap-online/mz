import type { DatabaseSync } from 'node:sqlite';
import type {
  StewardScope,
  StewardInteraction,
  StewardDecision,
  StartStewardInteraction,
  FinishStewardInteraction,
  RecordStewardDecision,
  StewardCursor,
} from './steward-types.js';
import {
  cursor,
  inboxScope,
  invalid,
  newId,
  record,
  timestamp,
  uuid,
} from './records.js';
import type {
  NewRuntimeEvent,
  RuntimeEvent,
  RuntimeRun,
  StartRun,
  FinishRun,
} from './types.js';
const INTERACTIONS =
  'SELECT i.sequence, i.id, i.source_id AS sourceId, i.run_id AS runId, i.scope, i.actor_id AS actorId, i.created_at AS createdAt, r.worker_id AS workerId, r.finished_at AS finishedAt, r.outcome FROM steward_interactions i JOIN runs r ON r.id = i.run_id';
const DECISIONS =
  'SELECT d.sequence,d.id,d.interaction_id AS interactionId,d.proposal_index AS proposalIndex,d.actor_id AS actorId,d.recorded_at AS recordedAt,d.approval_id AS approvalId,d.event_id AS eventId FROM steward_decisions d JOIN steward_interactions i ON i.id = d.interaction_id';
export function stewardScope(input: unknown): StewardScope {
  const scope = inboxScope(input);
  if (scope !== 'company' && !scope.startsWith('project:'))
    return invalid('scope');
  return scope as StewardScope;
}
export function getStewardInteraction(
  db: DatabaseSync,
  id: string,
): StewardInteraction | null {
  const row = db.prepare(INTERACTIONS + ' WHERE i.id = ?').get(uuid(id, 'id'));
  return row ? ({ ...row } as unknown as StewardInteraction) : null;
}
function pageOptions(input: StewardCursor): {
  scope: StewardScope | undefined;
  afterSequence: number;
  limit: number;
} {
  const values = record(input, ['scope', 'afterSequence', 'limit']);
  return {
    ...cursor({
      afterSequence: values['afterSequence'],
      limit: values['limit'],
    }),
    scope:
      values['scope'] === undefined ? undefined : stewardScope(values['scope']),
  };
}
export function listStewardInteractions(
  db: DatabaseSync,
  input: StewardCursor = {},
): StewardInteraction[] {
  const page = pageOptions(input);
  const args =
    page.scope === undefined
      ? [page.afterSequence, page.limit]
      : [page.afterSequence, page.scope, page.limit];
  return db
    .prepare(
      INTERACTIONS +
        ' WHERE i.sequence > ?' +
        (page.scope === undefined ? '' : ' AND i.scope = ?') +
        ' ORDER BY i.sequence LIMIT ?',
    )
    .all(...args)
    .map((row) => ({ ...row }) as unknown as StewardInteraction);
}
export function listStewardDecisions(
  db: DatabaseSync,
  input: StewardCursor = {},
): StewardDecision[] {
  const page = pageOptions(input);
  const args =
    page.scope === undefined
      ? [page.afterSequence, page.limit]
      : [page.afterSequence, page.scope, page.limit];
  return db
    .prepare(
      DECISIONS +
        ' WHERE d.sequence > ?' +
        (page.scope === undefined ? '' : ' AND i.scope = ?') +
        ' ORDER BY d.sequence LIMIT ?',
    )
    .all(...args)
    .map(
      (row) =>
        ({
          ...row,
          knowledgeId: 'decision-' + String(row['id']),
        }) as unknown as StewardDecision,
    );
}
export function startStewardInteraction(
  db: DatabaseSync,
  input: StartStewardInteraction,
  start: (input: StartRun) => RuntimeRun,
): StewardInteraction {
  const values = record(input, [
    'id',
    'sourceId',
    'actorId',
    'workerId',
    'scope',
    'startedAt',
  ]);
  const id = newId(values['id']);
  const sourceId = uuid(values['sourceId'], 'sourceId');
  const actorId = uuid(values['actorId'], 'actorId');
  const workerId = uuid(values['workerId'], 'workerId');
  const scope = stewardScope(values['scope']);
  const startedAt = timestamp(values['startedAt'], 'startedAt');
  const run = start({ actorId, workerId, startedAt });
  db.prepare(
    'INSERT INTO steward_interactions (id,source_id,run_id,scope,actor_id,created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, sourceId, run.id, scope, actorId, startedAt);
  return getStewardInteraction(db, id)!;
}
export function finishStewardInteraction(
  db: DatabaseSync,
  input: FinishStewardInteraction,
  finish: (input: FinishRun) => RuntimeRun,
): StewardInteraction {
  const values = record(input, ['id', 'actorId', 'outcome', 'finishedAt']);
  const id = uuid(values['id'], 'id');
  const actorId = uuid(values['actorId'], 'actorId');
  const current = getStewardInteraction(db, id);
  if (!current) return invalid('id');
  const result = values['outcome'];
  if (result !== 'succeeded' && result !== 'failed' && result !== 'cancelled')
    return invalid('outcome');
  finish({
    id: current.runId,
    actorId,
    outcome: result,
    finishedAt: timestamp(values['finishedAt'], 'finishedAt'),
  });
  return getStewardInteraction(db, id)!;
}
export function getStewardDecision(
  db: DatabaseSync,
  id: string,
): StewardDecision | null {
  const row = db.prepare(DECISIONS + ' WHERE d.id = ?').get(uuid(id, 'id'));
  return row
    ? ({ ...row, knowledgeId: 'decision-' + id } as unknown as StewardDecision)
    : null;
}
export function recordStewardDecision(
  db: DatabaseSync,
  input: RecordStewardDecision,
  append: (input: NewRuntimeEvent) => RuntimeEvent,
): StewardDecision {
  const values = record(input, [
    'id',
    'interactionId',
    'proposalIndex',
    'actorId',
    'approvalId',
    'recordedAt',
  ]);
  const id = newId(values['id']);
  const interactionId = uuid(values['interactionId'], 'id');
  const actorId = uuid(values['actorId'], 'actorId');
  const approvalId = uuid(values['approvalId'], 'id');
  const index = values['proposalIndex'];
  if (
    typeof index !== 'number' ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index > 15
  )
    return invalid();
  const recordedAt = timestamp(values['recordedAt'], 'occurredAt');
  const interaction = getStewardInteraction(db, interactionId);
  if (
    !interaction ||
    interaction.outcome !== 'succeeded' ||
    recordedAt < interaction.finishedAt!
  )
    return invalid('id');
  const event = append({
    type: 'decision.recorded',
    actorId,
    occurredAt: recordedAt,
    runId: interaction.runId,
  });
  db.prepare(
    'INSERT INTO steward_decisions (id,interaction_id,proposal_index,actor_id,recorded_at,approval_id,event_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, interactionId, index, actorId, recordedAt, approvalId, event.id);
  const row = db.prepare(DECISIONS + ' WHERE d.id = ?').get(id)!;
  return {
    ...row,
    knowledgeId: 'decision-' + id,
  } as unknown as StewardDecision;
}

export function getStewardDecisionForProposal(
  db: DatabaseSync,
  interactionId: string,
  proposalIndex: number,
): StewardDecision | null {
  uuid(interactionId, 'id');
  if (
    !Number.isSafeInteger(proposalIndex) ||
    proposalIndex < 0 ||
    proposalIndex > 15
  )
    return invalid();
  const row = db
    .prepare(
      'SELECT id FROM steward_decisions WHERE interaction_id = ? AND proposal_index = ?',
    )
    .get(interactionId, proposalIndex);
  return row ? getStewardDecision(db, String(row['id'])) : null;
}
