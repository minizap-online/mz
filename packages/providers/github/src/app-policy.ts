export const appPermissions = Object.freeze({
  metadata: 'read',
  contents: 'write',
  issues: 'write',
  pull_requests: 'write',
  repository_creation: 'write',
  organization_projects: 'write',
  members: 'read',
} as const);
export type Permissions = Record<string, string>;
export interface AppConnection {
  schemaVersion: 1;
  appId: number;
  installationId: number;
  organizationId: number;
  organization: string;
  ownerId: number;
  owner: string;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid GitHub response.');
  return value as Record<string, unknown>;
}
export function numericId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new Error('Invalid GitHub identity.');
  return value;
}
export function githubName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(value)
  )
    throw new Error('Invalid GitHub name.');
  return value;
}
export function repositoryName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value) ||
    value.endsWith('.git')
  )
    throw new Error('Invalid repository name.');
  return value;
}
export function validateAppConnection(value: unknown): AppConnection {
  const x = object(value);
  if (
    x['schemaVersion'] !== 1 ||
    Object.keys(x).sort().join(',') !==
      'appId,installationId,organization,organizationId,owner,ownerId,schemaVersion'
  )
    throw new Error('Unsupported GitHub App connection.');
  return {
    schemaVersion: 1,
    appId: numericId(x['appId']),
    installationId: numericId(x['installationId']),
    organizationId: numericId(x['organizationId']),
    organization: githubName(x['organization']),
    ownerId: numericId(x['ownerId']),
    owner: githubName(x['owner']),
  };
}
export function checkPermissions(value: unknown, expected: Permissions): void {
  const actual = object(value);
  const allowed: Permissions = { metadata: 'read', ...expected };
  if (
    Object.keys(actual).some((k) => actual[k] !== allowed[k]) ||
    Object.keys(expected).some((k) => actual[k] !== expected[k])
  )
    throw new Error('GitHub permissions differ from the approved profile.');
}
