import {
  prepareGitHubAccess,
  githubClientEnvironment,
  bindGitHubProfile,
  companyGitHubEnvironment,
  type GitHubAuthMode,
} from './github-auth.js';
import { hiddenSecret } from './secret-prompt.js';
import { execFile, spawn } from 'node:child_process';
import { readdir, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';
import {
  initializeLocalInstallation,
  installationPaths,
  readLocalInstallation,
  loadCompanyRepository,
  CompanyRepositoryError,
} from '@mz/core';
import type { CliResult } from './cli.js';
const execute = promisify(execFile);
export const initHelp = `Usage: mz init [options]

Prepare local MZ settings, a company shell and pilot runtime. Company context comes next in mz guide.

Options:
  --company DIR           Select/create a private company checkout
  --repository URL        Clone an existing HTTPS or git@host company repository
  --id SLUG               Technical organization identity for a new company marker
  --name NAME             Initial display name (can be refined in the company context)
  --github-auth MODE      token (recommended), existing, or explicitly broader oauth
  --github-token-file FILE  Read a fine-grained token from an existing protected file
  --state-directory DIR   Local runtime/source/session storage outside Git
  --yes                   Use supplied options/defaults without terminal questions
  --json                  Emit local settings and Codex availability
  -h, --help              Show help without setup

Settings: MZ_CONFIG_FILE or ~/.config/mz/config.json (XDG_CONFIG_HOME supported).
Existing company files/settings are preserved. GitHub scope/identity guidance comes before login.
Interactive GitHub setup recommends a fine-grained token via hidden credential input or protected-file reference;
no token argument, company-context prompt, or implicit browser OAuth. OAuth uses broader repo/read:org/gist scopes
and is only an explicit choice. MZ uses a private native gh profile with owner-only, unencrypted file storage.
Codex/ChatGPT model authentication is separate. --yes never starts an interactive login.
This devbox store is a local pilot workspace, not a verified authoritative server/backup deployment.
Next: mz guide, then mz ask. No model call is made by init.
`;
function invalid(): never {
  throw new Error();
}
function repository(value: string): void {
  if (
    value.length > 2048 ||
    /\s/.test(value) ||
    [...value].some(
      (char) =>
        char.codePointAt(0)! < 32 ||
        (char.codePointAt(0)! >= 127 && char.codePointAt(0)! <= 159),
    )
  )
    invalid();
  if (
    /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._/-]+(?:\.git)?$/.test(value) &&
    !value.includes('..')
  )
    return;
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.hostname
  )
    invalid();
}
async function probe(args: string[], env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    await execute('codex', args, {
      timeout: 5000,
      maxBuffer: 1024,
      env,
    });
    return true;
  } catch {
    return false;
  }
}
interface InitTerminal {
  question(prompt: string): Promise<string>;
  close(): void;
}
export interface InitHost {
  env?: NodeJS.ProcessEnv;
  terminal?: boolean;
  question?: (label: string, fallback: string) => Promise<string>;
  notice?: (text: string) => void;
  readSecret?: () => Promise<Buffer>;
  createTerminal?: () => InitTerminal;
}
async function nativeLogin(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit' });
    child.once('error', () => reject(new Error()));
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error()),
    );
  });
}
export async function runInitCli(
  args: readonly string[],
  host: InitHost = {},
): Promise<CliResult> {
  const env = host.env ?? process.env;
  const interactive =
    host.terminal ?? (process.stdin.isTTY && process.stdout.isTTY);
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!))
    return { stdout: initHelp, stderr: '', exitCode: 0 };
  const values: Record<string, string> = {};
  let yes = false,
    json = false;
  try {
    const seen = new Set<string>();
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (seen.has(arg)) invalid();
      seen.add(arg);
      if (arg === '--yes') {
        yes = true;
        continue;
      }
      if (arg === '--json') {
        json = true;
        continue;
      }
      if (
        ![
          '--company',
          '--repository',
          '--id',
          '--name',
          '--state-directory',
          '--github-auth',
          '--github-token-file',
        ].includes(arg)
      )
        invalid();
      const value = args[++i];
      if (!value || value.startsWith('--') || value.includes('\0')) invalid();
      values[arg.slice(2)] = value;
    }
    if (!yes && !interactive)
      return {
        stdout: '',
        stderr:
          'Use mz init in a terminal, or provide options with --yes for automation. Run mz init --help.\n',
        exitCode: 2,
      };
    if (values['repository']) repository(values['repository']);
    if (
      values['github-auth'] &&
      !['token', 'existing', 'oauth'].includes(values['github-auth'])
    )
      invalid();
    if (
      values['github-token-file'] &&
      values['github-auth'] &&
      values['github-auth'] !== 'token'
    )
      invalid();
    if (
      yes &&
      (values['github-auth'] === 'oauth' ||
        (values['github-auth'] === 'token' && !values['github-token-file']))
    )
      invalid();
  } catch {
    return {
      stdout: '',
      stderr: 'Invalid init options. Run mz init --help.\n',
      exitCode: 2,
    };
  }
  let terminal: InitTerminal | undefined;
  const openTerminal = (): InitTerminal =>
    host.createTerminal?.() ??
    createInterface({ input: process.stdin, output: process.stdout });
  try {
    const paths = installationPaths(env);
    const existing = await readLocalInstallation({
      configFile: paths.configFile,
    });
    if (!yes && !existing && !host.question) terminal = openTerminal();
    const ask = async (label: string, fallback: string): Promise<string> => {
      if (host.question)
        return (await host.question(label, fallback)).trim() || fallback;
      if (!terminal && !yes && interactive) terminal = openTerminal();
      if (!terminal) return fallback;
      return (
        (
          await terminal.question(
            `${label}${fallback ? ' [' + fallback + ']' : ''}: `,
          )
        ).trim() || fallback
      );
    };
    const login = async (
      command: string,
      args: string[],
      loginEnv: NodeJS.ProcessEnv = env,
    ): Promise<void> => {
      terminal?.close();
      terminal = undefined;
      await nativeLogin(command, args, loginEnv);
      if (!yes && !host.question) terminal = openTerminal();
    };
    const notice =
      host.notice ??
      ((text: string): void => {
        (json ? process.stderr : process.stdout).write(text);
      });
    const readSecret = async (): Promise<Buffer> => {
      terminal?.close();
      terminal = undefined;
      try {
        return await (
          host.readSecret ??
          (() => hiddenSecret('Fine-grained GitHub token (hidden)'))
        )();
      } finally {
        if (!yes && !host.question) terminal = openTerminal();
      }
    };
    const companyDirectory = resolve(
      values['company'] ??
        existing?.companyDirectory ??
        (await ask('Company directory', paths.companyDirectory)),
    );
    if (existing && existing.companyDirectory !== companyDirectory)
      throw new Error();
    const repo =
      values['repository'] ??
      (existing
        ? ''
        : await ask(
            'Existing company Git repository URL (blank creates a local shell)',
            '',
          ));
    if (repo) {
      repository(repo);
      let entries: string[] = [];
      try {
        entries = await readdir(companyDirectory);
      } catch (e) {
        if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT'))
          throw e;
      }
      if (entries.length > 0) {
        const selected = await execute(
          'git',
          ['-C', companyDirectory, 'remote', 'get-url', 'origin'],
          { env, timeout: 5000, maxBuffer: 4096 },
        );
        if (selected.stdout.trim() !== repo) throw new Error();
      }
      const access = await prepareGitHubAccess({
        repository: repo,
        companyDirectory,
        env,
        interactive: !yes && !!interactive,
        ...(values['github-auth']
          ? { method: values['github-auth'] as GitHubAuthMode }
          : {}),
        ...(values['github-token-file']
          ? { tokenFile: values['github-token-file'] }
          : {}),
        question: ask,
        notice,
        readSecret,
        login,
      });
      const gitEnv = access.profileDirectory
        ? githubClientEnvironment(env, access.profileDirectory)
        : await companyGitHubEnvironment(companyDirectory, env);
      if (entries.length === 0) {
        await mkdir(dirname(companyDirectory), {
          recursive: true,
          mode: 0o700,
        });
        const clone = async (): Promise<void> => {
          await execute('git', ['clone', '--', repo, companyDirectory], {
            timeout: 120000,
            maxBuffer: 4096,
            env: { ...gitEnv, GIT_TERMINAL_PROMPT: '0' },
          });
        };
        await clone();
      } else {
        if (access.profileDirectory)
          await execute('git', ['ls-remote', repo], {
            env: { ...gitEnv, GIT_TERMINAL_PROMPT: '0' },
            timeout: 30000,
            maxBuffer: 4096,
          });
      }
      if (access.profileDirectory)
        await bindGitHubProfile(
          companyDirectory,
          access.profileDirectory,
          gitEnv,
        );
    } else if (values['github-token-file'] || values['github-auth']) {
      invalid();
    }
    let marker: { id: string; name: string } | undefined;
    try {
      marker = (
        await loadCompanyRepository({ directory: companyDirectory, env: {} })
      ).config;
    } catch (error) {
      if (!(
        error instanceof CompanyRepositoryError &&
        ['CONFIG_NOT_FOUND', 'COMPANY_NOT_FOUND', 'INVALID_DIRECTORY'].includes(
          error.code,
        )
      ))
        throw error;
    }
    const id =
      values['id'] ??
      marker?.id ??
      (existing ? 'company' : await ask('Organization identifier', 'company'));
    const name =
      values['name'] ??
      marker?.name ??
      (existing
        ? 'Company'
        : await ask('Organization display name', 'Company'));
    const stateDirectory = resolve(
      values['state-directory'] ??
        (existing
          ? dirname(existing.runtimePath)
          : join(paths.stateDirectory, id)),
    );
    const settings = await initializeLocalInstallation({
      configFile: resolve(paths.configFile),
      companyDirectory,
      stateDirectory,
      id,
      name,
    });
    const available = await probe(['--version'], env);
    let authenticated = available && (await probe(['login', 'status'], env));
    if (!yes && interactive && available && !authenticated) {
      if (!terminal && !host.question) terminal = openTerminal();
      notice(
        'Separate connection: Codex / ChatGPT model access. This uses your model account/workspace permissions; it does not join a GitHub organization or grant repository access. Device code is the remote-terminal sign-in method, not a permission scope. Codex workspace tool permissions remain separate.\n',
      );
      if (
        /^(?:y|yes)$/i.test(
          await ask('Use Codex / ChatGPT provider-owned sign-in now?', 'yes'),
        )
      ) {
        await login('codex', ['login', '--device-auth']);
        authenticated = await probe(['login', 'status'], env);
      }
    }
    terminal?.close();
    terminal = undefined;
    return {
      stdout: json
        ? JSON.stringify({
            initialized: true,
            settings,
            codex: { available, authenticated },
          }) + '\n'
        : `MZ is configured.\nCompany: ${settings.companyDirectory}\nLocal pilot state: ${settings.runtimePath}\nCodex: ${!available ? 'not available on PATH' : authenticated ? 'existing login available' : 'sign-in needed; run codex login (Codex owns authentication)'}\n\nNext: mz guide\nThen: mz ask\nNo company context or project has been invented or activated.\n`,
      stderr: '',
      exitCode: 0,
    };
  } catch {
    return {
      stdout: '',
      stderr:
        'MZ init could not finish. Check private local paths, existing company files and Git access. Existing knowledge/settings are preserved; partial new shell files may remain and can be inspected before rerunning. For GitHub, use a fine-grained token in the hidden credential field or --github-token-file (protected file); choose broader OAuth explicitly if intended. Never put a token in command arguments or company conversation. Check repository selection/org approval and local GitHub profile access; optional write grants are not assumed. Run mz init --help.\n',
      exitCode: 1,
    };
  } finally {
    terminal?.close();
  }
}
