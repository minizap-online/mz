import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { preparePrivateHostDirectory } from './private-host-directory.js';
import {
  readPrivateArtifact,
  writePrivateArtifact,
} from './private-artifacts.js';
import { stewardUuid, stewardSync } from './steward-artifacts.js';
export interface ProvisioningIntent {
  schemaVersion: 1;
  actionId: string;
  actorId: string;
  organizationId: number;
  organization: string;
  projectId: string;
  repositoryName: string;
  private: boolean;
  operation: 'create' | 'attach';
}
export interface ProvisionedRepository {
  id: number;
  name: string;
  private: boolean;
  ownerId: number;
}
export interface ProvisioningProvider {
  getRepository(name: string): Promise<ProvisionedRepository>;
  createRepository(
    name: string,
    isPrivate: boolean,
  ): Promise<ProvisionedRepository>;
}
export interface ProvisioningOutcome {
  schemaVersion: 1;
  repositoryId: number;
  repositoryName: string;
  organizationId: number;
  private: boolean;
}
function intent(value: ProvisioningIntent): ProvisioningIntent {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.values(descriptors).some((d) => !('value' in d)) ||
    Object.keys(value).sort().join(',') !==
      'actionId,actorId,operation,organization,organizationId,private,projectId,repositoryName,schemaVersion'
  )
    throw new Error();
  stewardUuid(value.actionId);
  stewardUuid(value.actorId);
  if (
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.organizationId) ||
    value.organizationId <= 0 ||
    !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(value.organization) ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(value.projectId) ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value.repositoryName) ||
    value.repositoryName.endsWith('.git') ||
    typeof value.private !== 'boolean' ||
    !['create', 'attach'].includes(value.operation)
  )
    throw new Error();
  return { ...value };
}
async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return false;
    throw error;
  }
}
async function publishKnowledge(
  companyDirectory: string,
  value: ProvisioningIntent,
  outcome: ProvisioningOutcome,
): Promise<void> {
  for (const directory of [
    companyDirectory,
    join(companyDirectory, 'projects'),
    join(companyDirectory, 'projects', value.projectId),
    join(companyDirectory, 'projects', value.projectId, 'tasks'),
  ]) {
    if (!(await exists(directory))) await mkdir(directory, { mode: 0o700 });
    const info = await lstat(directory);
    if (
      !info.isDirectory() ||
      (info.uid !== 0 && info.uid !== process.geteuid?.())
    )
      throw new Error();
  }
  const root = join(companyDirectory, 'projects', value.projectId);
  const reference =
    '# Repository\n\nGitHub: ' +
    value.organization +
    '/' +
    value.repositoryName +
    '\nRepository ID: ' +
    outcome.repositoryId +
    '\nVisibility: ' +
    (outcome.private ? 'private' : 'public') +
    '\nProvisioning action: ' +
    value.actionId +
    '\n\nProvisioned resources do not by themselves prove development, deployment or project completion.\n';
  const files: Record<string, string> = {
    'REPOSITORY.md': reference,
    'project.yaml':
      'project: ' + value.projectId + '\nactivation: owner-approved\n',
    'PROJECT.md':
      '# Project\n\nRepository provisioning was authorized. Record the owner-approved purpose, scope, team and delivery brief here before development.\n',
    'STATUS.md':
      '# Status\n\nRepository connected. Development and deployment acceptance remain pending.\n',
    'ARCHITECTURE.md':
      '# Architecture\n\nRecord the agreed architecture after the project brief is established.\n',
    'DECISIONS.md':
      '# Decisions\n\nRecord accepted project decisions and their rationale here.\n',
    'tasks/steward.md':
      '---\nrole: steward\nproject: ' +
      value.projectId +
      '\n---\n# Project steward\n\nRead the project context, clarify the owner brief and coordinate approved work through the project repository and its issue tracker. Preserve existing knowledge and report actual development and deployment progress.\n',
  };
  for (const [name, text] of Object.entries(files)) {
    const path = join(root, name);
    if (await exists(path)) {
      const info = await lstat(path);
      if (!info.isFile() || info.nlink !== 1 || info.size > 65536)
        throw new Error();
      const existing = await readFile(path, 'utf8');
      if (name === 'REPOSITORY.md' && existing !== text) throw new Error();
      if (
        name === 'project.yaml' &&
        !new RegExp('^project: ' + value.projectId + '\\s*$', 'm').test(
          existing,
        )
      )
        throw new Error();
      continue;
    }
    const file = await open(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(text);
      await file.sync();
    } finally {
      await file.close();
    }
  }
  await stewardSync(join(root, 'tasks'));
  await stewardSync(root);
  await stewardSync(join(companyDirectory, 'projects'));
}
export async function provisionProject(options: {
  directory: string;
  companyDirectory: string;
  intent: ProvisioningIntent;
  approved: boolean;
  provider: ProvisioningProvider;
}): Promise<ProvisioningOutcome> {
  try {
    if (options.approved !== true) throw new Error();
    const requested = intent(options.intent);
    const root = await preparePrivateHostDirectory(options.directory, [
      options.companyDirectory,
    ]);
    const job = join(root, requested.actionId);
    if (!(await exists(job))) {
      await mkdir(job, { mode: 0o700 });
      await stewardSync(root);
    }
    await preparePrivateHostDirectory(job, [options.companyDirectory], false);
    const file = join(job, 'intent.json');
    if (await exists(file)) {
      const old = intent(
        JSON.parse(
          (
            await readPrivateArtifact(file, [options.companyDirectory])
          ).toString('utf8'),
        ) as ProvisioningIntent,
      );
      if (JSON.stringify(old) !== JSON.stringify(requested)) throw new Error();
    } else
      await writePrivateArtifact(file, JSON.stringify(requested) + '\n', [
        options.companyDirectory,
      ]);
    const outcomeFile = join(job, 'succeeded.json');
    let outcome: ProvisioningOutcome;
    if (await exists(outcomeFile)) {
      const value = JSON.parse(
        (
          await readPrivateArtifact(outcomeFile, [options.companyDirectory])
        ).toString('utf8'),
      ) as ProvisioningOutcome;
      if (
        value.schemaVersion !== 1 ||
        value.organizationId !== requested.organizationId ||
        value.repositoryName !== requested.repositoryName ||
        value.private !== requested.private ||
        !Number.isSafeInteger(value.repositoryId) ||
        value.repositoryId <= 0 ||
        Object.keys(value).sort().join(',') !==
          'organizationId,private,repositoryId,repositoryName,schemaVersion'
      )
        throw new Error();
      outcome = value;
    } else {
      const attempted = join(job, 'attempted.json');
      if (await exists(attempted)) throw new Error();
      let repository: ProvisionedRepository;
      if (requested.operation === 'attach')
        repository = await options.provider.getRepository(
          requested.repositoryName,
        );
      else {
        let missing = false;
        try {
          await options.provider.getRepository(requested.repositoryName);
        } catch (error) {
          if (
            error instanceof Error &&
            'code' in error &&
            error.code === 'NOT_FOUND'
          )
            missing = true;
          else throw error;
        }
        if (!missing) throw new Error();
        await writePrivateArtifact(
          attempted,
          JSON.stringify({
            schemaVersion: 1,
            phase: 'started',
            actionId: requested.actionId,
          }) + '\n',
          [options.companyDirectory],
        );
        repository = await options.provider.createRepository(
          requested.repositoryName,
          requested.private,
        );
      }
      if (
        !Number.isSafeInteger(repository.id) ||
        repository.id <= 0 ||
        repository.ownerId !== requested.organizationId ||
        repository.name.toLowerCase() !==
          requested.repositoryName.toLowerCase() ||
        repository.private !== requested.private
      )
        throw new Error();
      outcome = {
        schemaVersion: 1,
        repositoryId: repository.id,
        repositoryName: requested.repositoryName,
        organizationId: requested.organizationId,
        private: requested.private,
      };
      await writePrivateArtifact(outcomeFile, JSON.stringify(outcome) + '\n', [
        options.companyDirectory,
      ]);
    }
    await publishKnowledge(options.companyDirectory, requested, outcome);
    return outcome;
  } catch {
    throw new Error(
      'Project provisioning is incomplete. Check owner approval, connection, conflicts and the private action journal. An attempted create without a recorded result requires explicit attach reconciliation; do not blindly retry or delete remote resources.',
    );
  }
}
