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
