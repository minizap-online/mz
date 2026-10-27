import type {
  InboxDetails,
  InboxTriageChange,
  InboxCursor,
  InboxHistoryCursor,
  TriageInboxItem,
} from './inbox-types.js';
import type { NewInboxIntake, InboxIntake } from './intake-types.js';
import type {
  BackupRecord,
  BackupFreshness,
  BackupFreshnessPolicy,
} from './backup-types.js';
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
  backupId: string | null;
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
  backupId?: string;
}
export interface NewInboxItem {
  intake?: NewInboxIntake;
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
  getInboxDetails(id: string): InboxDetails | null;
  listInbox(cursor?: InboxCursor): InboxDetails[];
  listInboxChanges(cursor: InboxHistoryCursor): InboxTriageChange[];
  triageInboxItem(input: TriageInboxItem): InboxDetails;
  appendEvent(input: NewRuntimeEvent): RuntimeEvent;
  createInboxItem(input: NewInboxItem): InboxItem;
  startRun(input: StartRun): RuntimeRun;
  finishRun(input: FinishRun): RuntimeRun;
  getRun(id: string): RuntimeRun | null;
  getInboxItem(id: string): InboxItem | null;
  getInboxIntake(id: string): InboxIntake | null;
  listEvents(cursor?: EventCursor): RuntimeEvent[];
}
export interface RuntimeState extends RuntimeTransaction {
  getBackup(id: string): BackupRecord | null;
  getBackupFreshness(policy?: BackupFreshnessPolicy): BackupFreshness;
  verifyIntegrity(): { ok: true };
  transaction<T>(work: (transaction: RuntimeTransaction) => T): T;
  getStatus(): { schemaVersion: number; journalMode: 'wal'; foreignKeys: true };
  close(): void;
}
export interface RuntimeStateOptions {
  path: string;
  existingOnly?: boolean;
}
export type RuntimeStateErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_PATH'
  | 'STATE_CLOSED'
  | 'STATE_BUSY'
  | 'STATE_CONFLICT'
  | 'STATE_IO_ERROR'
  | 'STATE_CORRUPT'
  | 'UNSUPPORTED_DATABASE'
  | 'MIGRATION_FAILED'
  | 'SCHEMA_MISMATCH'
  | 'TRANSACTION_ACTIVE'
  | 'TRANSACTION_FAILED'
  | 'EXPIRED_TRANSACTION'
  | 'INBOX_NOT_FOUND'
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
  STATE_CORRUPT: 'Runtime state failed its integrity or reference checks.',
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
  INBOX_NOT_FOUND: 'The referenced inbox item does not exist.',
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
  'backupId',
  'sourceId',
  'workerId',
  'startedAt',
  'finishedAt',
  'outcome',
  'afterSequence',
  'limit',
  'path',
  'classification',
  'scope',
  'triaged',
  'changedAt',
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
