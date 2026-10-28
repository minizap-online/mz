import { resolve } from 'node:path';
import { readLocalInstallation } from '@mz/core';
export async function withInstallationDefaults(
  args: readonly string[],
): Promise<readonly string[]> {
  if (
    !['doctor', 'context', 'status', 'ingest', 'inbox', 'ask'].includes(
      args[0] ?? '',
    ) ||
    args.includes('--help') ||
    args.includes('-h')
  )
    return args;
  const settings = await readLocalInstallation();
  if (!settings) return args;
  const value = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index < 0 ? undefined : args[index + 1];
  };
  const company = value('--company') ?? process.env['MZ_COMPANY_DIR'];
  // Never pair another explicitly selected company with the saved company's runtime/storage.
  if (company !== undefined && resolve(company) !== settings.companyDirectory)
    return args;
  const result = [...args];
  const add = (flag: string, env: string, selected: string): void => {
    if (!args.includes(flag) && process.env[env] === undefined)
      result.push(flag, selected);
  };
  add('--company', 'MZ_COMPANY_DIR', settings.companyDirectory);
  if (args[0] !== 'context')
    add('--runtime', 'MZ_RUNTIME_DB', settings.runtimePath);
  if (args[0] === 'ingest') {
    add('--source-directory', 'MZ_SOURCE_DIR', settings.sourceDirectory);
    add('--actor', 'MZ_ACTOR_ID', settings.actorId);
  }
  if (args[0] === 'inbox' && args[1] === 'triage')
    add('--actor', 'MZ_ACTOR_ID', settings.actorId);
  if (args[0] === 'ask') {
    add('--artifact-directory', 'MZ_STEWARD_DIR', settings.artifactDirectory);
    add('--actor', 'MZ_ACTOR_ID', settings.actorId);
    add('--worker', 'MZ_WORKER_ID', settings.workerId);
  }
  return result;
}
