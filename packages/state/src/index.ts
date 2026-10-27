// Integration adapter: worker code obtains this interface through @mz/core.
export { createSqliteRuntimeState } from './sqlite.js';
export { RuntimeStateError, RUNTIME_EVENT_TYPES } from './types.js';
export type {
  RuntimeState,
  RuntimeStateOptions,
  RuntimeTransaction,
  RuntimeEvent,
  RuntimeEventType,
  RuntimeStateErrorCode,
  InboxItem,
  RuntimeRun,
  NewRuntimeEvent,
  NewInboxItem,
  StartRun,
  FinishRun,
  RunOutcome,
  EventCursor,
} from './types.js';

export type {
  BackupRecord,
  BackupFreshness,
  BackupFreshnessPolicy,
} from './backup-types.js';

export {
  requireKnownRuntimeState,
  beginRuntimeBackup,
  finishRuntimeBackup,
  snapshotRuntimeState,
} from './backup-integration.js';

export { inspectSqliteRuntimeState } from './inspection.js';
export type {
  RuntimeInspectionOptions,
  RuntimeInspection,
} from './inspection.js';

export { MAX_INTAKE_BYTES } from './intake-types.js';
export type {
  InboxScope,
  NewInboxIntake,
  InboxIntake,
} from './intake-types.js';

export { inboxScope as parseInboxScope } from './records.js';
