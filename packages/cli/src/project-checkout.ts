import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { installationPaths, readLocalInstallation } from '@mz/core';
import { GitHubAppError, type AppRequest } from '@mz/github';
import { appDirectory, loadAppConnection } from './github-app-store.js';
import { appGitEnvironment, prepareAppClient } from './github-app-transport.js';
import type { CliResult } from './cli.js';

const execute = promisify(execFile);
const quote = (s: string): string => "'" + s.replaceAll("'", "'\\''") + "'";
function contains(root: string, path: string): boolean {
  const p = relative(root, path);
  return p === '' || (!p.startsWith('../') && p !== '..' && !isAbsolute(p));
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
async function directDirectory(path: string): Promise<void> {
  if (!(await exists(path))) await mkdir(path, { mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || (await realpath(path)) !== path) throw new Error();
}
async function safeText(path: string): Promise<string> {
  if ((await realpath(path)) !== path) throw new Error();
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await file.stat();
    if (!info.isFile() || info.nlink !== 1 || info.size > 65536)
      throw new Error();
    const bytes = Buffer.alloc(65537);
    const result = await file.read(bytes, 0, bytes.length, 0);
    if (result.bytesRead > 65536) throw new Error();
    return new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(0, result.bytesRead),
    );
  } finally {
    await file.close();
  }
}
async function createText(path: string, text: string): Promise<void> {
  if (await exists(path)) {
    await safeText(path);
    return;
  }
  const file = await open(
    path,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
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
export async function runProjectCheckout(
  args: readonly string[],
  host: { env?: NodeJS.ProcessEnv; request?: AppRequest } = {},
): Promise<CliResult> {
  const [name, input, flag] = args;
  if (
    !name ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(name) ||
    !input ||
    args.length > 3 ||
    (flag !== undefined && flag !== '--delivery')
  )
    return {
      stdout: '',
      stderr: 'Usage: mz project checkout NAME DIRECTORY [--delivery]\n',
      exitCode: 2,
    };
  const profile = flag === '--delivery' ? 'delivery' : 'development';
  const env = host.env ?? process.env;
  try {
    const settings = await readLocalInstallation({
      configFile: installationPaths(env).configFile,
    });
    if (!settings) throw new Error();
    const saved = await loadAppConnection({
      companyDirectory: settings.companyDirectory,
      env,
      ...(host.request ? { request: host.request } : {}),
    });
    if (!saved) throw new Error();
    const access = await saved.app.getAccess();
    if (profile === 'delivery' && !access.deliveryReady)
      throw new GitHubAppError('DELIVERY_UNAVAILABLE');
    await saved.app.getRepository(name);
    const repository = saved.connection.organization + '/' + name;
    const url = 'https://github.com/' + repository + '.git';
    const directory = resolve(input);
    if (
      contains(settings.companyDirectory, directory) ||
      contains(directory, settings.companyDirectory)
    )
      throw new Error();
    // Only create the selected folder; the owner chooses an existing direct parent.
    if ((await realpath(dirname(directory))) !== dirname(directory))
      throw new Error();
    const selected: NodeJS.ProcessEnv = {
      ...env,
      MZ_GITHUB_REPOSITORY: repository,
      MZ_GITHUB_PERMISSION_PROFILE: profile,
    };
    delete selected.GIT_CONFIG_COUNT;
    delete selected.GIT_CONFIG_PARAMETERS;
    await prepareAppClient(settings.companyDirectory, env);
    const scoped = appGitEnvironment(settings.companyDirectory, selected);
    scoped.GIT_CONFIG_GLOBAL = '/dev/null';
    scoped.GIT_CONFIG_NOSYSTEM = '1';
    delete scoped.GIT_CONFIG_PARAMETERS;
    const git = async (values: string[]): Promise<string> =>
      (
        await execute(
          'git',
          [
            '-c',
            'core.hooksPath=/dev/null',
            '-c',
            'core.fsmonitor=false',
            ...values,
          ],
          { env: scoped, timeout: 120000, maxBuffer: 1048576 },
        )
      ).stdout.trim();
    if (!(await exists(directory))) await mkdir(directory, { mode: 0o700 });
    await directDirectory(directory);
    if ((await readdir(directory)).length === 0)
      await git(['clone', '--', url, directory]);
    if (
      (await git(['-C', directory, 'rev-parse', '--show-toplevel'])) !==
      directory
    )
      throw new Error();
    for (const operation of ['fetch', 'push']) {
      const values = await git([
        '-C',
        directory,
        'remote',
        'get-url',
        ...(operation === 'push' ? ['--push'] : []),
        '--all',
        'origin',
      ]);
      if (values !== url) throw new Error();
    }
    // Bind only this checkout. The helper command records the repository pin;
    // no token value is stored in Git configuration.
    const count = 0;
    const helper = scoped['GIT_CONFIG_VALUE_' + (count + 1)];
    if (!helper) throw new Error();
    const localConfig = async (
      pattern: string,
      namesOnly = false,
    ): Promise<string> => {
      try {
        return await git([
          '-C',
          directory,
          'config',
          '--local',
          '--includes',
          ...(namesOnly ? ['--name-only'] : []),
          '--get-regexp',
          pattern,
        ]);
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 1)
          return '';
        throw error;
      }
    };
    if (
      await localConfig(
        '^(http\\..*extraheader|url\\..*|include\\..*|includeif\\..*|core\\.sshcommand)$',
        true,
      )
    )
      throw new Error();
    const helperKeys = (
      await localConfig('^credential(\\..*)?\\.helper$', true)
    )
      .split('\n')
      .filter(Boolean);
    if (
      helperKeys.some((key) => key !== 'credential.https://github.com.helper')
    )
      throw new Error();
    if (helperKeys.length) {
      const values = (
        await git([
          '-C',
          directory,
          'config',
          '--local',
          '--get-all',
          'credential.https://github.com.helper',
        ])
      ).split('\n');
      // A repeat can change only the two explicitly selected MZ profiles.
      const alternate = helper.replace(
        "MZ_GITHUB_PERMISSION_PROFILE='" + profile + "'",
        "MZ_GITHUB_PERMISSION_PROFILE='" +
          (profile === 'delivery' ? 'development' : 'delivery') +
          "'",
      );
      if (
        values.some(
          (value) => value !== '' && value !== helper && value !== alternate,
        )
      )
        throw new Error();
    }
    await git([
      '-C',
      directory,
      'config',
      '--local',
      '--replace-all',
      'credential.https://github.com.helper',
      '',
    ]);
    await git([
      '-C',
      directory,
      'config',
      '--local',
      '--add',
      'credential.https://github.com.helper',
      helper,
    ]);
    await git([
      '-C',
      directory,
      'config',
      '--local',
      'credential.https://github.com.useHttpPath',
      'true',
    ]);
    for (const [key, fallback] of [
      ['user.name', 'MZ project worker'],
      ['user.email', 'mz-worker@users.noreply.github.com'],
    ]) {
      if (await localConfig('^' + key!.replace('.', '\\.') + '$', true))
        continue;
      let value = fallback!;
      try {
        value =
          (
            await execute('git', ['config', '--global', '--get', key!], {
              env,
              timeout: 5000,
              maxBuffer: 4096,
            })
          ).stdout.trim() || value;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 1))
          throw error;
      }
      await git(['-C', directory, 'config', '--local', key!, value]);
    }
    const local = join(directory, '.mz');
    await directDirectory(local);
    const activation =
      '# MZ project environment; no credentials stored here.\n' +
      'unset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN GITHUB_ENTERPRISE_TOKEN GH_DEBUG\n' +
      'unset GIT_CONFIG_COUNT GIT_CONFIG_PARAMETERS\n' +
      'export GIT_CONFIG_GLOBAL=/dev/null\nexport GIT_CONFIG_NOSYSTEM=1\n' +
      'export MZ_CONFIG_FILE=' +
      quote(resolve(installationPaths(env).configFile)) +
      '\n' +
      'export MZ_GITHUB_APP_COMPANY=' +
      quote(settings.companyDirectory) +
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
    const activateFile = join(local, 'activate');
    if (await exists(activateFile)) {
      const old = await safeText(activateFile);
      const alternate = activation.replace(
        "MZ_GITHUB_PERMISSION_PROFILE='" + profile + "'",
        "MZ_GITHUB_PERMISSION_PROFILE='" +
          (profile === 'delivery' ? 'development' : 'delivery') +
          "'",
      );
      if (old !== activation && old !== alternate) throw new Error();
      if (old !== activation) {
        const file = await open(
          activateFile,
          constants.O_WRONLY | constants.O_NOFOLLOW,
        );
        try {
          await file.truncate(0);
          await file.writeFile(activation);
          await file.sync();
        } finally {
          await file.close();
        }
      }
    } else await createText(activateFile, activation);
    const instructions =
      '# Project workflow\n\n' +
      'Repository: ' +
      repository +
      '\n\n' +
      'Use GitHub Issues for features, tasks and bugs. Before implementation, create or select an issue with purpose, scope, acceptance criteria and verification. Use milestones for delivery goals. Link commits and pull requests to their issue; update the issue with actual verification and remaining work before ending a session.\n\n' +
      'Read the owner prompt and existing project documentation before choosing architecture or product behavior. Create a project brief and ticket-based implementation plan first when requirements are incomplete. Preserve existing workflows and unrelated edits.\n\n' +
      'Pass --repo ' +
      repository +
      ' to GitHub CLI commands where supported. For gh api, use explicit repos/' +
      repository +
      '/... endpoints; gh api does not support --repo. Use the MZ project environment for renewable repository credentials; never print credentials or put them in .env, Git, logs or tickets. GitHub Projects are steward-managed organization resources. Deployment needs separately provisioned target credentials.\n\n' +
      'Use existing relevant checks and report what actually ran. Do not claim deployment, successful checks or steward actions without evidence.\n';
    await createText(join(local, 'HANDOFF.md'), instructions);
    await createText(join(directory, 'AGENTS.md'), instructions);
    const exclude = resolve(
      directory,
      await git(['-C', directory, 'rev-parse', '--git-path', 'info/exclude']),
    );
    const exclusion = (await exists(exclude)) ? await safeText(exclude) : '';
    if (!exclusion.split('\n').includes('/.mz/')) {
      const file = await open(
        exclude,
        constants.O_WRONLY |
          constants.O_APPEND |
          constants.O_CREAT |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await file.writeFile('\n/.mz/\n');
        await file.sync();
      } finally {
        await file.close();
      }
    }
    return {
      stdout:
        JSON.stringify({
          repository,
          directory,
          profile,
          deliveryReady: access.deliveryReady,
          activate: 'cd ' + quote(directory) + ' && source .mz/activate',
          start:
            "codex 'Read AGENTS.md and .mz/HANDOFF.md, then help me plan the project through GitHub tickets.'",
          development: 'ready-for-owner-prompt',
          deployment: 'not-configured',
        }) + '\n',
      stderr: '',
      exitCode: 0,
    };
  } catch (error) {
    return {
      stdout: '',
      stderr:
        error instanceof GitHubAppError && error.code === 'DELIVERY_UNAVAILABLE'
          ? error.message + '\n'
          : 'Project checkout preparation is incomplete. Check mz github status, the selected repository, destination identity and local files. Existing files were preserved; inspect partial preparation before retrying.\n',
      exitCode: 1,
    };
  }
}
