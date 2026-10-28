import { companyGitHubEnvironment } from './github-auth.js';
import { createDoctorHost, loadCompanyRepository } from '@mz/core';
import { isAbsolute } from 'node:path';
import {
  parseSecretRef,
  runDoctor,
  type DoctorOptions,
  type DoctorReport,
} from '@mz/core';
import type { CliResult } from './cli.js';
const doctorHelp = `Usage: mz doctor [options]

Inspect existing configuration and state; no initialization or migration.

Options:
  --company DIR                 Select private company repository (or MZ_COMPANY_DIR)
  --runtime FILE                Existing absolute runtime file (or MZ_RUNTIME_DB)
  --backup-max-age-hours HOURS   Positive integer age policy (default: 24)
  --secret-directory DIR        Private absolute host credential directory
  --secret-binding REF=FILE      Symbolic reference to allowlisted filename; repeatable
  --github-auth                  Probe existing gh credentials with a read-only identity request
  --json                         Emit structured health checks
  -h, --help                     Show this help

Exit codes: 0 healthy, 1 failed/unavailable checks, 2 invalid invocation.
The current offline GitHub integration is reported unavailable.
`;
function invalid(): never {
  throw new Error();
}
function absolute(value: string | undefined): string {
  if (value === undefined || !isAbsolute(value) || value.includes('\0'))
    return invalid();
  return value;
}
function render(report: DoctorReport): string {
  return report.checks
    .map(
      (check) =>
        `${check.status} ${check.id}: ${check.summary}${check.ageMs === undefined ? '' : ` Data age: ${check.ageMs === null ? 'unknown' : `${check.ageMs} ms`}.`}\n  ${check.action}\n`,
    )
    .join('');
}
export async function runDoctorCli(
  args: readonly string[],
): Promise<CliResult> {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!))
    return { stdout: doctorHelp, stderr: '', exitCode: 0 };
  let options: DoctorOptions;
  let json = false;
  try {
    options = {};
    let runtimePath = process.env['MZ_RUNTIME_DB'];
    let secretDirectory: string | undefined;
    const bindings: Record<string, string> = Object.create(null);
    const seen = new Set<string>();
    for (let index = 0; index < args.length; index++) {
      const flag = args[index]!;
      if (flag !== '--secret-binding' && seen.has(flag)) invalid();
      seen.add(flag);
      if (flag === '--json') {
        json = true;
        continue;
      }
      if (flag === '--github-auth') {
        options.githubAuth = true;
        continue;
      }
      if (
        ![
          '--company',
          '--runtime',
          '--backup-max-age-hours',
          '--secret-directory',
          '--secret-binding',
        ].includes(flag)
      )
        invalid();
      const value = args[++index];
      if (
        value === undefined ||
        value.length === 0 ||
        value.startsWith('--') ||
        value.includes('\0')
      )
        invalid();
      if (flag === '--company') options.company = { directory: value };
      else if (flag === '--runtime') runtimePath = value;
      else if (flag === '--secret-directory') secretDirectory = absolute(value);
      else if (flag === '--backup-max-age-hours') {
        if (!/^[1-9][0-9]*$/.test(value)) invalid();
        const milliseconds = Number(value) * 3600000;
        if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) invalid();
        options.backupMaxAgeMs = milliseconds;
      } else {
        const parts = value.split('=');
        if (parts.length !== 2) invalid();
        const ref = parseSecretRef(parts[0]!);
        const filename = parts[1]!;
        if (
          Object.hasOwn(bindings, ref) ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(filename)
        )
          invalid();
        bindings[ref] = filename;
      }
    }
    if (runtimePath !== undefined) options.runtimePath = absolute(runtimePath);
    const hasBindings = Object.keys(bindings).length > 0;
    if ((secretDirectory !== undefined) !== hasBindings) invalid();
    if (secretDirectory !== undefined)
      options.secrets = { directory: secretDirectory, bindings };
  } catch {
    return {
      stdout: '',
      stderr: 'Invalid doctor options. Run mz doctor --help.\n',
      exitCode: 2,
    };
  }
  try {
    let host;
    if (options.githubAuth) {
      const company = await loadCompanyRepository(options.company ?? {});
      host = createDoctorHost(
        await companyGitHubEnvironment(company.root, process.env),
      );
    }
    const report = await runDoctor(options, host);
    return {
      stdout: json ? JSON.stringify(report) + '\n' : render(report),
      stderr: '',
      exitCode: report.healthy ? 0 : 1,
    };
  } catch {
    return {
      stdout: '',
      stderr:
        'Doctor could not run with these settings. Run mz doctor --help.\n',
      exitCode: 2,
    };
  }
}
