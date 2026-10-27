import { loadCompanyRepository } from '@mz/core';
import { compileContext, ContextError } from '@mz/context';
import type { CliResult } from './cli.js';
const help = `Usage: mz context --role ROLE --task TASK [options]

Options:
  --company DIR    Private company repository (or MZ_COMPANY_DIR/discovery)
  --role ROLE      Assigned role slug; reads roles/ROLE.md
  --task TASK      Curated task slug; reads tasks/TASK.md or project tasks/TASK.md
  --project ID     Optional selected project slug
  --max-bytes N    Full output budget, 1024–1048576 bytes (default 65536)
  --json           Emit source manifest and rendered context as JSON
  -h, --help       Show help without reading company sources

Only declared relevant processes/policies/decisions are loaded; security baseline is required.
Output contains private curated knowledge. Keep it private; no credentials or raw inbox sources.
Compilation is informational and grants no capabilities. No model/provider/runtime action occurs.
Exit codes: 0 success, 1 source/scope/budget failure, 2 invalid invocation.
`;
function invalid(): never {
  throw new Error();
}
function slug(value: string | undefined): string {
  if (!value || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) return invalid();
  return value;
}
export async function runContextCli(
  args: readonly string[],
): Promise<CliResult> {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!))
    return { stdout: help, stderr: '', exitCode: 0 };
  let companyDirectory: string | undefined;
  let role: string;
  let task: string;
  let project: string | undefined;
  let maxBytes = 65536;
  let json = false;
  try {
    let selectedRole: string | undefined;
    let selectedTask: string | undefined;
    let selectedProject: string | undefined;
    const seen = new Set<string>();
    for (let i = 0; i < args.length; i++) {
      const flag = args[i]!;
      if (seen.has(flag)) invalid();
      seen.add(flag);
      if (flag === '--json') {
        json = true;
        continue;
      }
      if (
        !['--company', '--role', '--task', '--project', '--max-bytes'].includes(
          flag,
        )
      )
        invalid();
      const value = args[++i];
      if (!value || value.startsWith('--') || value.includes('\0')) invalid();
      if (flag === '--company') companyDirectory = value;
      else if (flag === '--role') selectedRole = value;
      else if (flag === '--task') selectedTask = value;
      else if (flag === '--project') selectedProject = value;
      else {
        if (!/^[0-9]+$/.test(value)) invalid();
        maxBytes = Number(value);
        if (
          !Number.isSafeInteger(maxBytes) ||
          maxBytes < 1024 ||
          maxBytes > 1048576
        )
          invalid();
      }
    }
    role = slug(selectedRole);
    task = slug(selectedTask);
    if (selectedProject !== undefined) project = slug(selectedProject);
  } catch {
    return {
      stdout: '',
      stderr: 'Invalid context options. Run mz context --help.\n',
      exitCode: 2,
    };
  }
  try {
    const company = await loadCompanyRepository(
      companyDirectory === undefined ? {} : { directory: companyDirectory },
    );
    const bundle = await compileContext({
      company,
      role,
      task,
      maxBytes,
      ...(project === undefined ? {} : { project }),
    });
    return {
      stdout: json ? JSON.stringify(bundle) + '\n' : bundle.text,
      stderr: '',
      exitCode: 0,
    };
  } catch (error) {
    return {
      stdout: '',
      stderr:
        (error instanceof ContextError
          ? error.message
          : 'Company context is unavailable; check private company selection and required sources.') +
        ' Run mz context --help.\n',
      exitCode: 1,
    };
  }
}
