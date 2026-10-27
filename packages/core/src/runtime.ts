import {
  createSqliteRuntimeState,
  type RuntimeState,
  type RuntimeStateOptions,
} from '@mz/state';

/** Control-plane initialization; workers use only the returned typed Core operations. */
export function openRuntimeState(options: RuntimeStateOptions): RuntimeState {
  return createSqliteRuntimeState(options);
}
