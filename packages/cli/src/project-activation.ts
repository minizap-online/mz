import { join, resolve } from 'node:path';
import { installationPaths } from '@mz/core';
import { appDirectory } from './github-app-store.js';
import { appGitEnvironment } from './github-app-transport.js';
const quote = (s: string): string => "'" + s.replaceAll("'", "'\\''") + "'";
export function projectActivation(options: {
  companyDirectory: string;
  env: NodeJS.ProcessEnv;
  repository: string;
  profile: 'development' | 'delivery';
  related: readonly string[];
  legacy?: boolean;
}): string {
  const {
    companyDirectory,
    env,
    repository,
    profile,
    related,
    legacy = false,
  } = options;
  const base =
    '# MZ project environment; no credentials stored here.\n' +
    'unset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN GITHUB_ENTERPRISE_TOKEN GH_DEBUG\n' +
    'unset GIT_CONFIG_COUNT GIT_CONFIG_PARAMETERS\n' +
    'export GIT_CONFIG_GLOBAL=/dev/null\nexport GIT_CONFIG_NOSYSTEM=1\n' +
    'export MZ_CONFIG_FILE=' +
    quote(resolve(installationPaths(env).configFile)) +
    '\n' +
    'export MZ_GITHUB_APP_COMPANY=' +
    quote(companyDirectory) +
    '\n' +
    'export MZ_GITHUB_REPOSITORY=' +
    quote(repository) +
    '\n' +
    'export GH_REPO=' +
    quote(repository) +
    '\n' +
    'export MZ_GITHUB_PERMISSION_PROFILE=' +
    quote(profile) +
    '\n' +
    'export PATH=' +
    quote(join(appDirectory(env), 'bin')) +
    ':"$PATH"\n';
  if (legacy) return base;
  const scopedEnv: NodeJS.ProcessEnv = {
    ...env,
    MZ_GITHUB_REPOSITORY: repository,
    MZ_GITHUB_PERMISSION_PROFILE: profile,
    MZ_GITHUB_RELATED_REPOSITORIES: related.join(',') || undefined,
  };
  delete scopedEnv.GIT_CONFIG_COUNT;
  delete scopedEnv.GIT_CONFIG_PARAMETERS;
  const scoped = appGitEnvironment(companyDirectory, scopedEnv);
  let extra = related.length
    ? 'export MZ_GITHUB_RELATED_REPOSITORIES=' + quote(related.join(',')) + '\n'
    : 'unset MZ_GITHUB_RELATED_REPOSITORIES\n';
  extra += 'export GIT_CONFIG_COUNT=3\n';
  for (let i = 0; i < 3; i++)
    for (const part of ['KEY', 'VALUE']) {
      const key = 'GIT_CONFIG_' + part + '_' + i;
      extra += 'export ' + key + '=' + quote(scoped[key]!) + '\n';
    }
  return base + extra;
}
