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
  --state-directory DIR   Local runtime/source/session storage outside Git
  --yes                   Use supplied options/defaults without terminal questions
  --json                  Emit local settings and Codex availability
  -h, --help              Show help without setup

Settings: MZ_CONFIG_FILE or ~/.config/mz/config.json (XDG_CONFIG_HOME supported).
Existing files/settings are preserved. No key values are requested or copied.
Interactive setup can open GitHub/Codex provider-owned sign-in when needed; --yes never initiates login.
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
export interface InitHost {
  env?: NodeJS.ProcessEnv;
  terminal?: boolean;
  question?: (label: string, fallback: string) => Promise<string>;
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
  } catch {
    return {
      stdout: '',
      stderr: 'Invalid init options. Run mz init --help.\n',
      exitCode: 2,
    };
  }
  let terminal: ReturnType<typeof createInterface> | undefined;
  try {
    const paths = installationPaths(env);
    const existing = await readLocalInstallation({
      configFile: paths.configFile,
    });
    if (!yes && !existing && !host.question)
      terminal = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    const ask = async (label: string, fallback: string): Promise<string> => {
      if (host.question)
        return (await host.question(label, fallback)).trim() || fallback;
      if (!terminal) return fallback;
      return (
        (
          await terminal.question(
            `${label}${fallback ? ' [' + fallback + ']' : ''}: `,
          )
        ).trim() || fallback
      );
    };
    const login = async (command: string, args: string[]): Promise<void> => {
      terminal?.close();
      terminal = undefined;
      await nativeLogin(command, args, env);
      if (!yes && !host.question)
        terminal = createInterface({
          input: process.stdin,
          output: process.stdout,
        });
    };
    const companyDirectory = resolve(
      values['company'] ??
        existing?.companyDirectory ??
        (await ask('Company directory', paths.companyDirectory)),
    );
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
      if (entries.length === 0) {
        await mkdir(dirname(companyDirectory), {
          recursive: true,
          mode: 0o700,
        });
        const clone = async (): Promise<void> => {
          await execute('git', ['clone', '--', repo, companyDirectory], {
            timeout: 120000,
            maxBuffer: 4096,
            env: { ...env, GIT_TERMINAL_PROMPT: '0' },
          });
        };
        try {
          await clone();
        } catch {
          const github =
            repo.startsWith('git@github.com:') ||
            (repo.startsWith('https:') &&
              new URL(repo).hostname === 'github.com');
          if (
            yes ||
            !interactive ||
            !github ||
            !/^(?:y|yes)$/i.test(
              await ask(
                'Authenticate with GitHub in its browser sign-in now?',
                'yes',
              ),
            )
          )
            throw new Error();
          const protocol = repo.startsWith('git@') ? 'ssh' : 'https';
          await login('gh', [
            'auth',
            'login',
            '--hostname',
            'github.com',
            '--git-protocol',
            protocol,
            '--web',
          ]);
          if (protocol === 'https') {
            await execute(
              'gh',
              ['auth', 'setup-git', '--hostname', 'github.com'],
              { env, timeout: 10000, maxBuffer: 1024 },
            );
          }
          let remaining: string[] = [];
          try {
            remaining = await readdir(companyDirectory);
          } catch (error) {
            if (!(
              error instanceof Error &&
              'code' in error &&
              error.code === 'ENOENT'
            ))
              throw error;
          }
          if (remaining.length) throw new Error(); // Never replace a partial or independently created checkout.
          await clone();
        }
      } else {
        const remote = await execute(
          'git',
          ['-C', companyDirectory, 'remote', 'get-url', 'origin'],
          { timeout: 5000, maxBuffer: 4096, env },
        );
        if (remote.stdout.trim() !== repo) invalid();
      }
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
      if (!terminal && !host.question)
        terminal = createInterface({
          input: process.stdin,
          output: process.stdout,
        });
      if (
        /^(?:y|yes)$/i.test(
          await ask('Use Codex provider-owned sign-in now?', 'yes'),
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
        'MZ init could not finish. Check private local paths, existing company files and Git access. Existing knowledge/settings are preserved; partial new shell files may remain and can be inspected before rerunning. For a private remote, establish Git credentials with your normal Git/GitHub login; MZ never asks you to paste a key. Run mz init --help.\n',
      exitCode: 1,
    };
  } finally {
    terminal?.close();
  }
}
