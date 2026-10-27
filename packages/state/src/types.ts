export const RUNTIME_EVENT_TYPES = [
  'inbox.created',
  'inbox.triaged',
  'run.started',
  'run.finished',
  'project.proposed',
  'project.activated',
  'project.archived',
  'decision.recorded',
  'work.started',
  'work.completed',
  'work.blocked',
  'pr.created',
  'merge.completed',
  'deploy.started',
  'deploy.completed',
  'deploy.failed',
  'deploy.rolled_back',
  'incident.opened',
  'incident.remediated',
  'incident.escalated',
  'incident.closed',
  'security.reviewed',
  'privacy.reviewed',
  'human.intervention',
  'context.miss',
  'capability.denied',
  'capability.requested',
  'capability.changed',
  'backup.completed',
  'backup.failed',
] as const;
export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];
export type RunOutcome = 'succeeded' | 'failed' | 'cancelled';
export interface RuntimeEvent {
  sequence: number;
  id: string;
  type: RuntimeEventType;
  actorId: string;
  occurredAt: string;
  runId: string | null;
  inboxItemId: string | null;
}
export interface InboxItem {
  id: string;
  sourceId: string;
  receivedAt: string;
}
export interface RuntimeRun {
  id: string;
  workerId: string;
  startedAt: string;
  finishedAt: string | null;
  outcome: RunOutcome | null;
}
export interface NewRuntimeEvent {
  id?: string;
  type: RuntimeEventType;
  actorId: string;
  occurredAt?: string;
  runId?: string;
  inboxItemId?: string;
}
export interface NewInboxItem {
  id?: string;
  sourceId: string;
  actorId: string;
  receivedAt?: string;
}
export interface StartRun {
  id?: string;
  workerId: string;
  actorId: string;
  startedAt?: string;
}
export interface FinishRun {
  id: string;
  actorId: string;
  outcome: RunOutcome;
  finishedAt?: string;
}
export interface EventCursor {
  afterSequence?: number;
  limit?: number;
}
export interface RuntimeTransaction {
  appendEvent(input: NewRuntimeEvent): RuntimeEvent;
  createInboxItem(input: NewInboxItem): InboxItem;
  startRun(input: StartRun): RuntimeRun;
  finishRun(input: FinishRun): RuntimeRun;
  getRun(id: string): RuntimeRun | null;
  getInboxItem(id: string): InboxItem | null;
  listEvents(cursor?: EventCursor): RuntimeEvent[];
}
export interface RuntimeState extends RuntimeTransaction {
  transaction<T>(work: (transaction: RuntimeTransaction) => T): T;
  getStatus(): { schemaVersion: number; journalMode: 'wal'; foreignKeys: true };
  close(): void;
}
export interface RuntimeStateOptions {
  path: string;
}
export type RuntimeStateErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_PATH'
  | 'STATE_CLOSED'
  | 'STATE_BUSY'
  | 'STATE_CONFLICT'
  | 'STATE_IO_ERROR'
  | 'UNSUPPORTED_DATABASE'
  | 'MIGRATION_FAILED'
  | 'SCHEMA_MISMATCH'
  | 'TRANSACTION_ACTIVE'
  | 'TRANSACTION_FAILED'
  | 'EXPIRED_TRANSACTION'
  | 'RUN_NOT_FOUND'
  | 'RUN_FINISHED';
export class RuntimeStateError extends Error {
  readonly code: RuntimeStateErrorCode;
  readonly field?: string;
  constructor(code: RuntimeStateErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'RuntimeStateError';
    this.code = code;
    if (field !== undefined) this.field = field;
  }
}
const SAFE_MESSAGES: Record<RuntimeStateErrorCode, string> = {
  INVALID_INPUT:
    'Use the documented structural fields, identifiers, and UTC timestamps.',
  INVALID_PATH: 'Choose an explicit absolute regular database file path.',
  STATE_CLOSED: 'Runtime state is closed; open a new Core state instance.',
  STATE_BUSY: 'Runtime state is busy; retry after the current writer finishes.',
  STATE_CONFLICT:
    'The operation conflicts with an existing record or reference.',
  STATE_IO_ERROR:
    'Runtime storage could not be accessed; check the path and permissions.',
  UNSUPPORTED_DATABASE:
    'Select an MZ runtime database or a new empty database file.',
  MIGRATION_FAILED:
    'Migration failed and was rolled back; check the release migration instructions.',
  SCHEMA_MISMATCH:
    'Database schema, version, or migration history differs from this release.',
  TRANSACTION_ACTIVE:
    'Use the scoped transaction API; nested or outer-state operations are unsupported.',
  TRANSACTION_FAILED: 'The transaction failed and was rolled back.',
  EXPIRED_TRANSACTION:
    'The transaction API is valid only during its synchronous callback.',
  RUN_NOT_FOUND: 'Start the referenced run before finishing it.',
  RUN_FINISHED: 'A completed run cannot be finished again.',
};
const SAFE_FIELDS = [
  'id',
  'type',
  'actorId',
  'occurredAt',
  'runId',
  'inboxItemId',
  'sourceId',
  'workerId',
  'startedAt',
  'finishedAt',
  'outcome',
  'afterSequence',
  'limit',
  'path',
];

export function stateError(
  error: unknown,
  fallback: RuntimeStateErrorCode = 'STATE_IO_ERROR',
): RuntimeStateError {
  let code = fallback;
  let field: string | undefined;
  try {
    if (
      error instanceof RuntimeStateError &&
      Object.hasOwn(SAFE_MESSAGES, error.code)
    ) {
      code = error.code;
      if (error.field !== undefined && SAFE_FIELDS.includes(error.field))
        field = error.field;
    } else if (
      error instanceof Error &&
      'errcode' in error &&
      typeof error.errcode === 'number'
    ) {
      const primary = error.errcode & 255;
      if (primary === 5 || primary === 6) code = 'STATE_BUSY';
      if (primary === 19) code = 'STATE_CONFLICT';
    }
  } catch {
    code = fallback;
    field = undefined;
  }
  // Never preserve messages/causes, including a caller-created RuntimeStateError.
  return new RuntimeStateError(code, SAFE_MESSAGES[code], field);
}
