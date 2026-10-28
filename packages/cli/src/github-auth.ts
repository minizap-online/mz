import { lstat } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { dirname, basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  createHostFileSecretProvider,
  installationPaths,
  parseSecretRef,
  preparePrivateHostDirectory,
} from '@mz/core';
import { hiddenSecret } from './secret-prompt.js';
const execute = promisify(execFile);
const quote = (value: string): string =>
  "'" + value.replaceAll("'", "'\\''") + "'";
export type GitHubAuthMode = 'token' | 'oauth' | 'existing';
export interface GitHubAccess {
  mode: GitHubAuthMode;
  profileDirectory?: string;
  account?: string;
}
export interface GitHubSetupOptions {
  repository: string;
  companyDirectory: string;
  env: NodeJS.ProcessEnv;
  interactive: boolean;
  method?: GitHubAuthMode;
  tokenFile?: string;
  question?: (label: string, fallback: string) => Promise<string>;
  notice: (text: string) => void;
  readSecret?: () => Promise<Buffer>;
  login?: (
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ) => Promise<void>;
}
export function githubRemote(
  repository: string,
): { owner: string; name: string; protocol: 'https' | 'ssh' } | null {
  const ssh =
    /^git@github\.com:([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/.exec(
      repository,
    );
  if (ssh) return { owner: ssh[1]!, name: ssh[2]!, protocol: 'ssh' };
  try {
    const url = new URL(repository);
    const path = /^\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/.exec(
      url.pathname,
    );
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !path
    )
      return null;
    return { owner: path[1]!, name: path[2]!, protocol: 'https' };
  } catch {
    return null;
  }
}
export function githubScopeExplanation(repository: string): string {
  const remote = githubRemote(repository);
  if (!remote) throw new Error();
  return `GitHub connection: ${remote.owner}/${remote.name} (${remote.protocol}). This is separate from Codex/ChatGPT model login.\nRecommended: one fine-grained token with resource owner ${remote.owner}, Only select repositories: ${remote.name}; finite expiry (for example 30 days, within company policy). Metadata: Read; Contents: Read for clone, Read/write if MZ will maintain company knowledge. Add Issues/Pull requests: Read/write only when steering those workflows, and organization Projects: Read/write only for the actual organization board. Do not add organization administration, Members, billing, secrets or workflow permissions for basic setup. These are recommendations, not a claim the token has those grants.\nIdentity: use an existing approved account or an optional dedicated automation organization Member with base repository access None and Write only on the intended repositories through a restricted team; no Owner/admin/billing role. Signing in does not create, invite or grant that account membership. A token never exceeds its issuer's access.\nAlternative browser OAuth uses GitHub CLI's broader repo, read:org and gist scopes; it cannot select fine-grained repository permissions. Choose it explicitly only if that access is intended. SSH login can also prompt for SSH keys.\nMZ uses its own GitHub CLI profile. New credentials are stored by gh in an owner-only local file, unencrypted, outside Git/company context; no shared personal keyring entry is overwritten. New tokens are never put in command arguments, model environment, company files, SQLite or logs. Existing mode deliberately keeps the current Git authentication; it does not narrow its permissions.\n`;
}
function profileEnvironment(
  env: NodeJS.ProcessEnv,
  profile: string,
): NodeJS.ProcessEnv {
  const scoped: NodeJS.ProcessEnv = {
    ...env,
    GH_CONFIG_DIR: profile,
    GH_HOST: 'github.com',
  };
  for (const name of [
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'GH_ENTERPRISE_TOKEN',
    'GITHUB_ENTERPRISE_TOKEN',
    'GH_DEBUG',
  ])
    delete scoped[name];
  return scoped;
}
export function githubClientEnvironment(
  env: NodeJS.ProcessEnv,
  profile: string,
): NodeJS.ProcessEnv {
  const scoped = profileEnvironment(env, profile);
  const count = Number(env['GIT_CONFIG_COUNT'] ?? '0');
  if (!Number.isSafeInteger(count) || count < 0 || count > 32)
    throw new Error();
  const entries = [
    ['credential.https://github.com.helper', ''],
    [
      'credential.https://github.com.helper',
      '!env -u GH_TOKEN -u GITHUB_TOKEN -u GH_ENTERPRISE_TOKEN -u GITHUB_ENTERPRISE_TOKEN -u GH_DEBUG GH_CONFIG_DIR=' +
        quote(profile) +
        ' GH_HOST=github.com gh auth git-credential',
    ],
    ['credential.https://github.com.useHttpPath', 'true'],
  ];
  for (let i = 0; i < entries.length; i++) {
    scoped['GIT_CONFIG_KEY_' + (count + i)] = entries[i]![0];
    scoped['GIT_CONFIG_VALUE_' + (count + i)] = entries[i]![1];
  }
  scoped['GIT_CONFIG_COUNT'] = String(count + entries.length);
  return scoped;
}
async function checkNativeProfileFiles(profile: string): Promise<void> {
  for (const name of ['hosts.yml', 'config.yml']) {
    let stat;
    try {
      stat = await lstat(join(profile, name));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        continue;
      // eslint-disable-next-line preserve-caught-error -- Credential-store paths are private; expose a static boundary failure.
      throw new Error();
    }
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o077) !== 0 ||
      (stat.uid !== 0 && stat.uid !== process.geteuid?.())
    )
      throw new Error();
  }
}
async function tokenLogin(
  bytes: Buffer,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'gh',
      [
        'auth',
        'login',
        '--hostname',
        'github.com',
        '--git-protocol',
        'https',
        '--with-token',
        '--insecure-storage',
      ],
      { env, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let size = 0;
    const timer = setTimeout(() => child.kill('SIGTERM'), 30000);
    const discard = (data: Buffer): void => {
      size += data.length;
      data.fill(0);
      if (size > 8192) child.kill('SIGTERM');
    };
    child.stdout.on('data', discard);
    child.stderr.on('data', discard);
    child.stdin.on('error', () => {
      /* Child outcome determines success; never expose a provider error. */
    });
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error());
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && size <= 8192) resolve();
      else reject(new Error());
    });
    child.stdin.end(bytes);
  });
}
export async function prepareGitHubAccess(
  options: GitHubSetupOptions,
): Promise<GitHubAccess> {
  const remote = githubRemote(options.repository);
  if (!remote) return { mode: 'existing' };
  options.notice(githubScopeExplanation(options.repository));
  let method = options.tokenFile ? 'token' : options.method;
  if (!method)
    method = options.interactive
      ? ((await options.question?.(
          'GitHub authentication method (token / existing / oauth)',
          'token',
        )) as GitHubAuthMode)
      : 'existing';
  if (!['token', 'oauth', 'existing'].includes(method ?? '')) throw new Error();
  if (method === 'existing') return { mode: 'existing' };
  const profileDirectory = await preparePrivateHostDirectory(
    join(dirname(resolve(installationPaths(options.env).configFile)), 'github'),
    [resolve(options.companyDirectory)],
  );
  await checkNativeProfileFiles(profileDirectory);
  const env = profileEnvironment(options.env, profileDirectory);
  if (method === 'oauth') {
    if (!options.interactive || !options.login) throw new Error();
    await options.login(
      'gh',
      [
        'auth',
        'login',
        '--hostname',
        'github.com',
        '--git-protocol',
        remote.protocol,
        '--web',
        '--insecure-storage',
      ],
      env,
    );
  } else {
    if (remote.protocol !== 'https')
      throw new Error(
        'Fine-grained GitHub tokens require an HTTPS repository URL.',
      );
    options.notice(
      'Create/review the fine-grained token at https://github.com/settings/personal-access-tokens/new . The GitHub UI is where repository selection, permission grants, expiry and any org approval are set. Enter it only in the next hidden credential field, never in company conversation.\n',
    );
    const use = async (bytes: Buffer): Promise<void> => {
      try {
        const token = bytes.toString('utf8').trim();
        if (!/^github_pat_[A-Za-z0-9_]+$/.test(token) || token.length > 4096)
          throw new Error();
        const input = Buffer.from(token);
        try {
          await tokenLogin(input, env);
        } finally {
          input.fill(0);
        }
      } finally {
        bytes.fill(0);
      }
    };
    if (options.tokenFile) {
      const path = resolve(options.tokenFile);
      await preparePrivateHostDirectory(
        dirname(path),
        [resolve(options.companyDirectory)],
        false,
      );
      const provider = await createHostFileSecretProvider({
        directory: dirname(path),
        bindings: { 'github:setup': basename(path) },
      });
      const handle = await provider.resolve(parseSecretRef('github:setup'));
      try {
        await handle.use(async (value) => use(Buffer.from(value.revealText())));
      } finally {
        handle.dispose();
      }
    } else {
      if (!options.interactive) throw new Error();
      await use(
        await (
          options.readSecret ??
          (() => hiddenSecret('Fine-grained GitHub token (hidden)'))
        )(),
      );
    }
  }
  await checkNativeProfileFiles(profileDirectory);
  const result = await execute(
    'gh',
    ['api', '--hostname', 'github.com', 'user', '--jq', '.login'],
    { env, timeout: 10000, maxBuffer: 1024 },
  );
  const account = result.stdout.trim();
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(account)) throw new Error();
  options.notice(
    `GitHub identity: ${account}. Next, repository read access will be checked; optional write/board grants are not assumed.\n`,
  );
  return { mode: method, profileDirectory, account };
}
export async function bindGitHubProfile(
  companyDirectory: string,
  profile: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const entries = [
    ['credential.https://github.com.helper', ''],
    [
      'credential.https://github.com.helper',
      '!env -u GH_TOKEN -u GITHUB_TOKEN -u GH_ENTERPRISE_TOKEN -u GITHUB_ENTERPRISE_TOKEN -u GH_DEBUG GH_CONFIG_DIR=' +
        quote(profile) +
        ' GH_HOST=github.com gh auth git-credential',
    ],
    ['credential.https://github.com.useHttpPath', 'true'],
    ['mz.github.profile', profile],
    ['mz.github.version', '1'],
  ];
  for (const [key, value] of entries)
    await execute(
      'git',
      [
        '-C',
        companyDirectory,
        'config',
        '--local',
        key === 'credential.https://github.com.helper' && value !== ''
          ? '--add'
          : '--replace-all',
        key!,
        value!,
      ],
      { env, timeout: 5000, maxBuffer: 1024 },
    );
}
export async function companyGitHubEnvironment(
  companyDirectory: string,
  env: NodeJS.ProcessEnv,
): Promise<NodeJS.ProcessEnv> {
  let profile: string;
  try {
    const result = await execute(
      'git',
      [
        '-C',
        companyDirectory,
        'config',
        '--local',
        '--get',
        'mz.github.profile',
      ],
      { env, timeout: 5000, maxBuffer: 4096 },
    );
    profile = result.stdout.trim();
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      [1, 128].includes(Number(error.code))
    )
      return env;
    // eslint-disable-next-line preserve-caught-error -- Native command output/paths are private; expose a static boundary failure.
    throw new Error();
  }
  const expected = join(
    dirname(resolve(installationPaths(env).configFile)),
    'github',
  );
  if (profile !== expected) throw new Error();
  await preparePrivateHostDirectory(profile, [companyDirectory], false);
  await checkNativeProfileFiles(profile);
  const version = await execute(
    'git',
    ['-C', companyDirectory, 'config', '--local', '--get', 'mz.github.version'],
    { env, timeout: 5000, maxBuffer: 1024 },
  );
  if (version.stdout.trim() !== '1') throw new Error();
  return githubClientEnvironment(env, profile);
}
