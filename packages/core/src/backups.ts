import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import {
  beginRuntimeBackup,
  finishRuntimeBackup,
  requireKnownRuntimeState,
  snapshotRuntimeState,
  type BackupRecord,
  type RuntimeState,
} from '@mz/state';
import { privateHostDirectory } from './private-host-directory.js';

export interface BackupSnapshot {
  readonly backupId: string;
  readonly snapshotPath: string;
  readonly schemaVersion: number;
}
export interface EncryptedBackupReceipt {
  backupId: string;
  encrypted: true;
}
export interface EncryptedBackupHook {
  store(snapshot: BackupSnapshot): Promise<EncryptedBackupReceipt>;
}
export interface RuntimeBackupOptions {
  state: RuntimeState;
  stagingDirectory: string;
  destinationId: string;
  actorId: string;
  hook: EncryptedBackupHook;
}
export type BackupErrorCode =
  | 'INVALID_BACKUP_OPTIONS'
  | 'UNSAFE_BACKUP_STAGING'
  | 'BACKUP_FAILED'
  | 'INVALID_BACKUP_RECEIPT'
  | 'BACKUP_CLEANUP_FAILED'
  | 'BACKUP_AUDIT_FAILED';
const messages: Record<BackupErrorCode, string> = {
  INVALID_BACKUP_OPTIONS:
    'Use a known runtime state, private absolute staging directory, UUID identities, and an encrypted-storage hook.',
  UNSAFE_BACKUP_STAGING:
    'Configure accessible private host staging with protected ownership, permissions, and ancestors.',
  BACKUP_FAILED:
    'Snapshot or encrypted external storage failed; source details are withheld.',
  INVALID_BACKUP_RECEIPT:
    'The external hook must acknowledge the matching backup identity and encrypted durable storage.',
  BACKUP_CLEANUP_FAILED:
    'Plaintext staging cleanup failed; inspect the private operation directory through the control plane.',
  BACKUP_AUDIT_FAILED:
    'The backup result could not be durably audited; do not assume success.',
};
const codes = new WeakMap<object, BackupErrorCode>();
export class BackupError extends Error {
  readonly code: BackupErrorCode;
  readonly backupId?: string;
  constructor(code: BackupErrorCode, backupId?: string) {
    const safeCode =
      typeof code === 'string' && Object.hasOwn(messages, code)
        ? code
        : 'INVALID_BACKUP_OPTIONS';
    super(messages[safeCode]);
    this.name = 'BackupError';
    this.code = safeCode;
    if (
      typeof backupId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        backupId,
      )
    )
      this.backupId = backupId;
    codes.set(this, safeCode);
  }
}
function own(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new Error();
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== null && prototype !== Object.prototype) throw new Error();
  const output: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !fields.includes(key)) throw new Error();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) throw new Error();
    output[key] = descriptor.value;
  }
  return output;
}
function identity(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    throw new Error();
  return value;
}
function storeMethod(
  hook: unknown,
): (snapshot: BackupSnapshot) => Promise<EncryptedBackupReceipt> {
  if (hook === null || typeof hook !== 'object') throw new Error();
  let current: object | null = hook;
  for (let depth = 0; current !== null && depth < 16; depth++) {
    const property = Object.getOwnPropertyDescriptor(current, 'store');
    if (property) {
      if (!('value' in property) || typeof property.value !== 'function')
        throw new Error();
      return property.value.bind(hook) as (
        snapshot: BackupSnapshot,
      ) => Promise<EncryptedBackupReceipt>;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  throw new Error();
}

export async function backupRuntimeState(
  options: RuntimeBackupOptions,
): Promise<BackupRecord> {
  let state: RuntimeState;
  let staging: string;
  let destinationId: string;
  let actorId: string;
  let store: (snapshot: BackupSnapshot) => Promise<EncryptedBackupReceipt>;
  try {
    const values = own(options, [
      'state',
      'stagingDirectory',
      'destinationId',
      'actorId',
      'hook',
    ]);
    state = values['state'] as RuntimeState;
    requireKnownRuntimeState(state);
    if (
      typeof values['stagingDirectory'] !== 'string' ||
      !isAbsolute(values['stagingDirectory']) ||
      values['stagingDirectory'].includes('\0')
    )
      throw new Error();
    staging = values['stagingDirectory'];
    destinationId = identity(values['destinationId']);
    actorId = identity(values['actorId']);
    store = storeMethod(values['hook']);
  } catch {
    throw new BackupError('INVALID_BACKUP_OPTIONS');
  }
  const id = randomUUID();
  let began = false;
  let operationDirectory: string | undefined;
  async function cleanup(): Promise<void> {
    if (operationDirectory !== undefined) {
      try {
        await rm(operationDirectory, { recursive: true, force: true });
        operationDirectory = undefined;
      } catch {
        throw new BackupError('BACKUP_CLEANUP_FAILED', id);
      }
    }
  }
  try {
    try {
      beginRuntimeBackup(state, { id, destinationId, actorId });
      began = true;
    } catch {
      throw new BackupError('BACKUP_AUDIT_FAILED', id);
    }
    try {
      staging = await privateHostDirectory(staging);
      operationDirectory = await mkdtemp(join(staging, 'mz-backup-'));
    } catch {
      throw new BackupError('UNSAFE_BACKUP_STAGING', id);
    }
    const snapshotPath = join(operationDirectory, 'snapshot.sqlite3');
    const schemaVersion = state.getStatus().schemaVersion;
    try {
      await snapshotRuntimeState(state, snapshotPath);
    } catch {
      throw new BackupError('BACKUP_FAILED', id);
    }
    let receipt: unknown;
    try {
      receipt = await store(
        Object.freeze({ backupId: id, snapshotPath, schemaVersion }),
      );
    } catch {
      throw new BackupError('BACKUP_FAILED', id);
    }
    try {
      const acknowledged = own(receipt, ['backupId', 'encrypted']);
      if (acknowledged['backupId'] !== id || acknowledged['encrypted'] !== true)
        throw new Error();
    } catch {
      throw new BackupError('INVALID_BACKUP_RECEIPT', id);
    }
    await cleanup();
    try {
      return finishRuntimeBackup(state, { id, outcome: 'succeeded' });
    } catch {
      throw new BackupError('BACKUP_AUDIT_FAILED', id);
    }
  } catch (error) {
    let code =
      (typeof error === 'object' && error !== null
        ? codes.get(error)
        : undefined) ?? 'BACKUP_FAILED';
    try {
      await cleanup();
    } catch {
      code = 'BACKUP_CLEANUP_FAILED';
    }
    if (began) {
      try {
        finishRuntimeBackup(state, { id, outcome: 'failed' });
      } catch {
        code = 'BACKUP_AUDIT_FAILED';
      }
    }
    throw new BackupError(code, id);
  }
}
