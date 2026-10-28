import { chmod, lstat, readFile } from 'node:fs/promises';
import { preparePrivateHostDirectory, writePrivateArtifact } from '@mz/core';
import { nativeExecutable, NO_GITHUB_KEYRING } from './github-client.js';
import { promisify } from 'node:util';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join, delimiter } from 'node:path';
import { installationPaths, readLocalInstallation } from '@mz/core';
import { appDirectory, loadAppConnection } from './github-app-store.js';
import type { CliResult } from './cli.js';
const execute = promisify(execFile);
const quote = (s: string): string => "'" + s.replaceAll("'", "'\\''") + "'";
export function appGitEnvironment(
  companyDirectory: string,
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {
    ...env,
    MZ_GITHUB_APP_COMPANY: resolve(companyDirectory),
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '/usr/bin/false',
    SSH_ASKPASS: '/usr/bin/false',
    PATH: join(appDirectory(env), 'bin') + delimiter + (env.PATH ?? ''),
  };
  for (const name of [
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'GH_ENTERPRISE_TOKEN',
    'GITHUB_ENTERPRISE_TOKEN',
    'GH_DEBUG',
  ])
    delete result[name];
  const count = Number(env['GIT_CONFIG_COUNT'] ?? 0);
  if (!Number.isSafeInteger(count) || count < 0 || count > 32)
    throw new Error('Invalid Git environment.');
  const helper =
    '!env MZ_CONFIG_FILE=' +
    quote(resolve(installationPaths(env).configFile)) +
    ' MZ_GITHUB_APP_COMPANY=' +
    quote(resolve(companyDirectory)) +
    ' ' +
    quote(process.execPath) +
    ' ' +
    quote(fileURLToPath(new URL('./main.js', import.meta.url))) +
    ' github credential';
  const entries = [
    ['credential.https://github.com.helper', ''],
    ['credential.https://github.com.helper', helper],
    ['credential.https://github.com.useHttpPath', 'true'],
  ];
  for (let i = 0; i < entries.length; i++) {
    result['GIT_CONFIG_KEY_' + (count + i)] = entries[i]![0];
    result['GIT_CONFIG_VALUE_' + (count + i)] = entries[i]![1];
  }
  result['GIT_CONFIG_COUNT'] = String(count + entries.length);
  return result;
}
export async function bindAppGit(
  companyDirectory: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await prepareAppClient(companyDirectory, env);
  const environment = appGitEnvironment(companyDirectory, env);
  const count = Number(env['GIT_CONFIG_COUNT'] ?? 0);
  const entries = [
    ['credential.https://github.com.helper', ''],
    [
      'credential.https://github.com.helper',
      environment['GIT_CONFIG_VALUE_' + (count + 1)]!,
    ],
    ['credential.https://github.com.useHttpPath', 'true'],
    ['mz.github.profile', appDirectory(env)],
    ['mz.github.version', '2'],
  ];
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i]!;
    await execute(
      'git',
      [
        '-C',
        companyDirectory,
        'config',
        '--local',
        i === 1 ? '--add' : '--replace-all',
        key!,
        value!,
      ],
      { env, timeout: 5000, maxBuffer: 1024 },
    );
  }
}
async function selected(env: NodeJS.ProcessEnv) {
  const settings = await readLocalInstallation({
    configFile: installationPaths(env).configFile,
  });
  const companyDirectory =
    env['MZ_GITHUB_APP_COMPANY'] ?? settings?.companyDirectory;
  if (!companyDirectory) throw new Error();
  const saved = await loadAppConnection({ companyDirectory, env });
  if (!saved) throw new Error();
  return { ...saved, companyDirectory };
}
export async function runGitHubAppCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  input?: string,
): Promise<CliResult> {
  const failure = {
    stdout: '',
    stderr:
      'MZ GitHub App request failed. Check mz init / connection permissions; no personal credential fallback was used.\n',
    exitCode: 1,
  };
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!))
    return {
      stdout:
        'Usage: mz github status | credential get\nApp status is read-only. credential is the native Git helper protocol; no token JSON API.\n',
      stderr: '',
      exitCode: 0,
    };
  try {
    const saved = await selected(env);
    if (args[0] === 'gh') {
      const nativeArgs = args.slice(2);
      if (
        nativeArgs.some(
          (arg) =>
            arg === '--hostname' ||
            arg.startsWith('--hostname=') ||
            /^[a-z][a-z0-9+.-]*:\/\//i.test(arg) ||
            arg.startsWith('//'),
        )
      )
        return failure;
      const executable = args[1];
      if (
        executable &&
        nativeArgs.length === 1 &&
        nativeArgs[0] === '--version'
      ) {
        const value = await execute(executable, ['--version'], {
          env: appGitEnvironment(saved.companyDirectory, env),
          timeout: 5000,
          maxBuffer: 4096,
        });
        return { stdout: value.stdout, stderr: '', exitCode: 0 };
      }
      if (
        !executable ||
        !['api', 'issue', 'pr', 'repo', 'run', 'workflow', 'release'].includes(
          nativeArgs[0] ?? '',
        )
      )
        return failure;
      const explicit = nativeArgs.findIndex(
        (a) => a === '-R' || a === '--repo',
      );
      let target = explicit >= 0 ? nativeArgs[explicit + 1] : env['GH_REPO'];
      if (!target) {
        const remote = await execute('git', ['remote', 'get-url', 'origin'], {
          cwd: process.cwd(),
          env,
          timeout: 5000,
          maxBuffer: 4096,
        });
        target = remote.stdout
          .trim()
          .replace(/^https:\/\/github\.com\//, '')
          .replace(/\.git$/, '');
      }
      const parts = target?.split('/');
      if (
        !parts ||
        parts.length !== 2 ||
        parts[0]?.toLowerCase() !== saved.connection.organization.toLowerCase()
      )
        return failure;
      const code = await saved.app.withRepositoryToken(
        parts[1]!,
        async (credential) =>
          new Promise<number>((resolve, reject) => {
            const clean = appGitEnvironment(saved.companyDirectory, env);
            const child = spawn(executable, nativeArgs, {
              env: {
                ...clean,
                GH_TOKEN: credential,
                DBUS_SESSION_BUS_ADDRESS: NO_GITHUB_KEYRING,
                GH_HOST: 'github.com',
                GH_CONFIG_DIR: join(saved.directory, 'native'),
              },
              stdio: 'inherit',
            });
            child.once('error', reject);
            child.once('exit', (code) => resolve(code ?? 1));
          }),
      );
      return { stdout: '', stderr: '', exitCode: code };
    }
    if (args[0] === 'status' && args.length === 1) {
      await saved.app.verify();
      return {
        stdout:
          JSON.stringify({
            connected: true,
            identity: 'github-app',
            organization: saved.connection.organization,
            appId: saved.connection.appId,
            installationId: saved.connection.installationId,
            protectedOwnerId: saved.connection.ownerId,
          }) + '\n',
        stderr: '',
        exitCode: 0,
      };
    }
    if (args[0] === 'credential' && args.length === 2) {
      if (['store', 'erase'].includes(args[1]!))
        return { stdout: '', stderr: '', exitCode: 0 };
      if (args[1] !== 'get') return failure;
      const text = input ?? (await readProtocol());
      if (text.length > 8192) throw new Error();
      const lines = text.trim().split('\n');
      const data: Record<string, string> = {};
      for (const line of lines) {
        const index = line.indexOf('=');
        if (index < 1) throw new Error();
        const key = line.slice(0, index);
        // Git advertises multi-valued capabilities/challenges/state. Legacy username/password
        // helpers may ignore these and other unrecognised attributes; only identity routes access.
        if (!['protocol', 'host', 'path'].includes(key)) continue;
        if (Object.hasOwn(data, key)) throw new Error();
        data[key] = line.slice(index + 1);
      }
      if (
        data['protocol'] !== 'https' ||
        data['host'] !== 'github.com' ||
        !data['path']
      )
        throw new Error();
      const parts = data['path'].replace(/\.git$/, '').split('/');
      if (
        parts.length !== 2 ||
        parts[0]!.toLowerCase() !== saved.connection.organization.toLowerCase()
      )
        throw new Error();
      return await saved.app.withRepositoryToken(parts[1]!, async (token) => ({
        stdout: 'username=x-access-token\npassword=' + token + '\n\n',
        stderr: '',
        exitCode: 0,
      }));
    }
    return {
      stdout: '',
      stderr: 'Unsupported GitHub App command. Run mz github --help.\n',
      exitCode: 2,
    };
  } catch {
    // Git otherwise treats a helper error as permission to try askpass or another source.
    if (args[0] === 'credential' && args[1] === 'get')
      return { ...failure, stdout: 'quit=true\n\n', exitCode: 0 };
    return failure;
  }
}
async function readProtocol(): Promise<string> {
  let value = '';
  for await (const chunk of process.stdin) {
    value += String(chunk);
    if (value.length > 8192) throw new Error();
  }
  return value;
}

function appClientText(
  companyDirectory: string,
  env: NodeJS.ProcessEnv,
  native: string,
): string {
  return (
    '#!/bin/sh\n# MZ private GitHub client\nexec env MZ_CONFIG_FILE=' +
    quote(resolve(installationPaths(env).configFile)) +
    ' MZ_GITHUB_APP_COMPANY=' +
    quote(resolve(companyDirectory)) +
    ' ' +
    quote(process.execPath) +
    ' ' +
    quote(fileURLToPath(new URL('./main.js', import.meta.url))) +
    ' github gh ' +
    quote(native) +
    ' "$@"\n'
  );
}
export async function prepareAppClient(
  companyDirectory: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const bin = await preparePrivateHostDirectory(
    join(appDirectory(env), 'bin'),
    [companyDirectory],
  );
  const native = await nativeExecutable(env);
  const path = join(bin, 'gh');
  const content = appClientText(companyDirectory, env, native);
  try {
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > 8192 ||
      (await readFile(path, 'utf8')) !== content
    )
      throw new Error('App client differs from the selected installation.');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
    await writePrivateArtifact(path, content, [companyDirectory]);
    await chmod(path, 0o700);
  }
}
export async function checkAppClient(
  companyDirectory: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const bin = await preparePrivateHostDirectory(
    join(appDirectory(env), 'bin'),
    [companyDirectory],
    false,
  );
  const path = join(bin, 'gh');
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o777) !== 0o700 ||
    stat.size > 8192 ||
    (stat.uid !== 0 && stat.uid !== process.geteuid?.())
  )
    throw new Error();
  const native = await nativeExecutable(env);
  if (
    (await readFile(path, 'utf8')) !==
    appClientText(companyDirectory, env, native)
  )
    throw new Error();
}
