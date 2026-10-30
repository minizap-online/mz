import {
  ProviderError,
  type CreateWorkItem,
  type ProviderActionContext,
  type ProviderAuditRecord,
  type ProviderAuditSink,
  type ProviderOperation,
  type ProviderReference,
  type ProviderRepository,
  type ProviderWorkItem,
  type RepositoryReference,
  type SourceControlProvider,
  type WorkItemReference,
  type WorkProvider,
} from '@mz/core';

export interface GitHubSkeletonOptions {
  audit: ProviderAuditSink;
}
function own(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error();
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== null && prototype !== Object.prototype) throw new Error();
  const values: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !fields.includes(key)) throw new Error();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) throw new Error();
    values[key] = descriptor.value;
  }
  return values;
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
function context(input: unknown): ProviderActionContext {
  const values = own(input, ['actionId', 'actorId', 'runId']);
  const result: ProviderActionContext = {
    actionId: identity(values['actionId']),
    actorId: identity(values['actorId']),
    ...(Object.hasOwn(values, 'runId')
      ? { runId: identity(values['runId']) }
      : {}),
  };
  return Object.freeze(result);
}
function reference<Kind extends 'repository' | 'work-item'>(
  input: unknown,
  kind: Kind,
): ProviderReference<Kind> {
  const values = own(input, ['provider', 'kind', 'externalId', 'url']);
  const externalId = values['externalId'];
  const repositoryPattern =
    '[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}';
  const pattern = new RegExp(
    `^${repositoryPattern}${kind === 'work-item' ? '#[1-9][0-9]{0,14}' : ''}$`,
  );
  if (
    values['provider'] !== 'github' ||
    values['kind'] !== kind ||
    typeof externalId !== 'string' ||
    !pattern.test(externalId) ||
    ['.', '..'].includes(externalId.split('/')[1]!.split('#')[0]!)
  )
    throw new Error();
  if (
    Object.hasOwn(values, 'url') &&
    (typeof values['url'] !== 'string' || values['url'].length > 2048)
  )
    throw new Error();
  // Descriptive URLs never enter action identity or audit records.
  return Object.freeze({ provider: 'github', kind, externalId });
}
function appendMethod(input: unknown): ProviderAuditSink['append'] {
  if (!input || typeof input !== 'object') throw new Error();
  let current: object | null = input;
  for (let depth = 0; current !== null && depth < 16; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(current, 'append');
    if (descriptor) {
      if (!('value' in descriptor) || typeof descriptor.value !== 'function')
        throw new Error();
      return descriptor.value.bind(input) as ProviderAuditSink['append'];
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  throw new Error();
}

/** Offline contract skeleton: never performs HTTP, resolves credentials or returns fake data. */
export function createGitHubProviderSkeleton(
  options: GitHubSkeletonOptions,
): SourceControlProvider & WorkProvider {
  let append: ProviderAuditSink['append'];
  try {
    const values = own(options, ['audit']);
    append = appendMethod(values['audit']);
  } catch {
    throw new ProviderError('INVALID_INPUT');
  }
  async function audit(record: ProviderAuditRecord): Promise<void> {
    try {
      await append(Object.freeze(record));
    } catch {
      throw new ProviderError('AUDIT_FAILED');
    }
  }
  async function unavailable(
    operation: ProviderOperation,
    input: unknown,
    action: unknown,
    kind: 'repository' | 'work-item',
    create = false,
  ): Promise<never> {
    let target: ProviderReference;
    let actor: ProviderActionContext;
    try {
      actor = context(action);
      if (create) {
        const values = own(input, ['repository', 'title', 'body']);
        if (
          typeof values['title'] !== 'string' ||
          values['title'].trim().length === 0 ||
          values['title'].length > 256 ||
          typeof values['body'] !== 'string' ||
          values['body'].length > 65536
        )
          throw new Error();
        target = reference(values['repository'], kind);
      } else target = reference(input, kind);
    } catch {
      throw new ProviderError('INVALID_INPUT');
    }
    const base = { ...actor, provider: 'github', operation, target };
    await audit({
      ...base,
      occurredAt: new Date().toISOString(),
      phase: 'started',
    });
    await audit({
      ...base,
      occurredAt: new Date().toISOString(),
      phase: 'failed',
      errorCode: 'NOT_IMPLEMENTED',
    });
    throw new ProviderError('NOT_IMPLEMENTED');
  }
  return Object.freeze({
    provider: 'github',
    getRepository: (
      ref: RepositoryReference,
      action: ProviderActionContext,
    ): Promise<ProviderRepository> =>
      unavailable('repository.read', ref, action, 'repository'),
    getWorkItem: (
      ref: WorkItemReference,
      action: ProviderActionContext,
    ): Promise<ProviderWorkItem> =>
      unavailable('work-item.read', ref, action, 'work-item'),
    createWorkItem: (
      input: CreateWorkItem,
      action: ProviderActionContext,
    ): Promise<ProviderWorkItem> =>
      unavailable('work-item.create', input, action, 'repository', true),
  });
}

export { createGitHubApp, type GitHubApp, type AppRepository } from './app.js';
export {
  appPermissions,
  deliveryAppPermissions,
  repositoryDeliveryPermissions,
  validateAppConnection,
  type AppConnection,
  type Permissions,
} from './app-policy.js';
export {
  GitHubAppError,
  convertAppManifest,
  githubRequest,
  type AppRequest,
} from './app-api.js';
export { discoverAppConnection } from './app.js';
