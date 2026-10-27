import type {
  ProviderAuditRecord,
  RepositoryReference,
  SourceControlProvider,
  WorkProvider,
} from '../../packages/core/dist/index.js';
import { createGitHubProviderSkeleton } from '../../packages/providers/github/dist/index.js';

export const alternate: RepositoryReference = {
  provider: 'another-host',
  kind: 'repository',
  externalId: 'team/project',
};
export function verifyContracts(audit: {
  append(record: ProviderAuditRecord): Promise<void>;
}) {
  const github = createGitHubProviderSkeleton({ audit });
  const source: SourceControlProvider = github;
  const work: WorkProvider = github;
  const action = { actionId: 'uuid', actorId: 'uuid' };
  const repository = source.getRepository(alternate, action);
  const issue = work.createWorkItem(
    { repository: alternate, title: 'Title', body: 'Body' },
    action,
  );
  // @ts-expect-error Native GitHub objects are not the neutral repository result.
  const vendor: Promise<{ full_name: string }> = repository;
  // @ts-expect-error A repository reference cannot be used as a work-item reference.
  work.getWorkItem(alternate, action);
  // @ts-expect-error A failed audit must carry a bounded safe error code.
  const failed: ProviderAuditRecord = {
    ...action,
    provider: 'github',
    operation: 'repository.read',
    target: alternate,
    occurredAt: 'utc',
    phase: 'failed',
  };
  const payload: ProviderAuditRecord = {
    ...action,
    provider: 'github',
    operation: 'repository.read',
    target: alternate,
    occurredAt: 'utc',
    phase: 'started',
    // @ts-expect-error Request content has no place in structural audit records.
    body: 'private',
  };
  return { repository, issue, vendor, failed, payload };
}
