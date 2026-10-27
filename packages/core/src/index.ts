export { loadCompanyRepository } from './company/repository.js';
export { CompanyRepositoryError } from './company/types.js';
export type {
  CompanyConfig,
  CompanyRepository,
  CompanyRepositoryOptions,
  CompanyRepositoryErrorCode,
  Metadata,
  MetadataValue,
} from './company/types.js';
export { openRuntimeState } from './runtime.js';
export { RuntimeStateError, RUNTIME_EVENT_TYPES } from '@mz/state';
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
} from '@mz/state';
export { parseSecretRef, SecretError } from './secrets/types.js';
export { createHostFileSecretProvider } from './secrets/host-files.js';
export { redactForLogging } from './secrets/handles.js';
export type {
  SecretRef,
  SecretProvider,
  SecretHandle,
  SecretValue,
  SecretErrorCode,
  HostFileSecretProviderOptions,
  RedactedValue,
} from './secrets/types.js';

export type {
  BackupRecord,
  BackupFreshness,
  BackupFreshnessPolicy,
} from '@mz/state';
export { backupRuntimeState, BackupError } from './backups.js';
export type {
  RuntimeBackupOptions,
  EncryptedBackupHook,
  EncryptedBackupReceipt,
  BackupSnapshot,
  BackupErrorCode,
} from './backups.js';

export { ProviderError } from './providers.js';
export type {
  ProviderReference,
  RepositoryReference,
  WorkItemReference,
  ProviderRepository,
  ProviderWorkItem,
  CreateWorkItem,
  ProviderActionContext,
  ProviderOperation,
  ProviderErrorCode,
  ProviderAuditRecord,
  ProviderAuditSink,
  SourceControlProvider,
  WorkProvider,
} from './providers.js';

export { inspectSqliteRuntimeState as inspectRuntimeState } from '@mz/state';
export type { RuntimeInspectionOptions, RuntimeInspection } from '@mz/state';

export { runDoctor, DoctorError } from './doctor.js';
export type { DoctorOptions, DoctorCheck, DoctorReport } from './doctor.js';
export type { DoctorHost, DoctorCommandResult } from './doctor-host.js';
