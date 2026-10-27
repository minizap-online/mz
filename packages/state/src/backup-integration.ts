import { RuntimeStateError, type RuntimeState } from './types.js';
import type {
  BackupRecord,
  BeginBackup,
  FinishBackup,
} from './backup-types.js';

export interface BackupControl {
  begin(input: BeginBackup): BackupRecord;
  finish(input: FinishBackup): BackupRecord;
  snapshot(destination: string): Promise<void>;
}
const controls = new WeakMap<RuntimeState, BackupControl>();
export function registerBackupControl(
  state: RuntimeState,
  control: BackupControl,
): void {
  controls.set(state, control);
}
function control(state: RuntimeState): BackupControl {
  const found = controls.get(state);
  if (!found)
    throw new RuntimeStateError(
      'INVALID_INPUT',
      'Use a known Core runtime state instance.',
    );
  return found;
}
export function requireKnownRuntimeState(state: RuntimeState): void {
  control(state);
}
export function beginRuntimeBackup(
  state: RuntimeState,
  input: BeginBackup,
): BackupRecord {
  return control(state).begin(input);
}
export function finishRuntimeBackup(
  state: RuntimeState,
  input: FinishBackup,
): BackupRecord {
  return control(state).finish(input);
}
export function snapshotRuntimeState(
  state: RuntimeState,
  destination: string,
): Promise<void> {
  return control(state).snapshot(destination);
}
