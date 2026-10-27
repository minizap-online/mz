/** Provider-scoped identity. A URL is descriptive metadata, never authority. */
export interface ProviderReference<Kind extends string = string> {
  readonly provider: string;
  readonly kind: Kind;
  readonly externalId: string;
  readonly url?: string;
}
export type RepositoryReference = ProviderReference<'repository'>;
export type WorkItemReference = ProviderReference<'work-item'>;
export interface ProviderRepository {
  readonly ref: RepositoryReference;
  readonly defaultBranch: string;
}
export interface ProviderWorkItem {
  readonly ref: WorkItemReference;
  readonly repository: RepositoryReference;
  readonly title: string;
  readonly body: string;
  readonly status: 'open' | 'closed';
}
export interface CreateWorkItem {
  readonly repository: RepositoryReference;
  readonly title: string;
  readonly body: string;
}
export interface ProviderActionContext {
  readonly actionId: string;
  readonly actorId: string;
  readonly runId?: string;
}
export type ProviderOperation =
  'repository.read' | 'work-item.read' | 'work-item.create';
export type ProviderErrorCode =
  'INVALID_INPUT' | 'NOT_IMPLEMENTED' | 'AUDIT_FAILED' | 'PROVIDER_FAILED';
export type ProviderAuditRecord = ProviderActionContext & {
  readonly provider: string;
  readonly operation: ProviderOperation;
  readonly target: Omit<ProviderReference, 'url'>;
  readonly occurredAt: string;
} & (
    | { readonly phase: 'started' | 'succeeded'; readonly errorCode?: never }
    | { readonly phase: 'failed'; readonly errorCode: ProviderErrorCode }
  );
/** Resolve only after a durable append; reject without exposing source details. */
export interface ProviderAuditSink {
  append(record: ProviderAuditRecord): Promise<void>;
}
export interface SourceControlProvider {
  readonly provider: string;
  getRepository(
    ref: RepositoryReference,
    action: ProviderActionContext,
  ): Promise<ProviderRepository>;
}
export interface WorkProvider {
  readonly provider: string;
  getWorkItem(
    ref: WorkItemReference,
    action: ProviderActionContext,
  ): Promise<ProviderWorkItem>;
  createWorkItem(
    input: CreateWorkItem,
    action: ProviderActionContext,
  ): Promise<ProviderWorkItem>;
}
const messages: Record<ProviderErrorCode, string> = {
  INVALID_INPUT:
    'Supply valid scoped references, structural action identities and bounded operation inputs.',
  NOT_IMPLEMENTED:
    'This provider skeleton does not implement remote operations.',
  AUDIT_FAILED: 'Provider auditing failed; do not assume the action completed.',
  PROVIDER_FAILED:
    'The provider operation failed; source details are withheld.',
};
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  constructor(code: ProviderErrorCode) {
    const safeCode =
      typeof code === 'string' && Object.hasOwn(messages, code)
        ? code
        : 'INVALID_INPUT';
    super(messages[safeCode]);
    this.name = 'ProviderError';
    this.code = safeCode;
  }
}
