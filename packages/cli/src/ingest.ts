import { isAbsolute, resolve } from 'node:path';
import {
  ingestMarkdown,
  loadCompanyRepository,
  openRuntimeState,
  parseInboxScope,
  type InboxScope,
  type RuntimeState,
} from '@mz/core';
import type { CliResult } from './cli.js';
const help = `Usage: mz ingest FILE [options]
       mz ingest - [options]       Read Markdown bytes from stdin

Options:
  --company DIR             Private company repository (or MZ_COMPANY_DIR)
  --runtime FILE            Existing absolute runtime database (or MZ_RUNTIME_DB)
  --source-directory DIR    Private absolute source storage outside Git (or MZ_SOURCE_DIR)
  --actor UUID              Assigned actor identity (or MZ_ACTOR_ID)
  --scope SCOPE             unclassified, company, project-candidate, project:<id>
  --json                    Emit generated identities and structural metadata
  -h, --help                Show help without reading input

Input is untrusted UTF-8 data, at most 1 MiB, without NUL bytes.
Retained privately until explicit operator removal; never published or executed.
Exit codes: 0 imported, 1 input/storage failure, 2 invalid invocation.
`;
function invalid(): never {
  throw new Error();
}
function absolute(value: string | undefined): string {
  if (!value || !isAbsolute(value) || value.includes('\0')) return invalid();
  return value;
}
export async function runIngestCli(
  args: readonly string[],
): Promise<CliResult> {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!))
    return { stdout: help, stderr: '', exitCode: 0 };
  let file: string;
  let runtimePath: string;
  let sourceDirectory: string;
  let actorId: string;
  let scope: InboxScope;
  let company: string | undefined;
  let json = false;
  try {
    let selectedFile: string | undefined;
    let runtime = process.env['MZ_RUNTIME_DB'];
    let sources = process.env['MZ_SOURCE_DIR'];
    let actor = process.env['MZ_ACTOR_ID'];
    let selectedScope: string | undefined;
    const seen = new Set<string>();
    for (let index = 0; index < args.length; index++) {
      const argument = args[index]!;
      if (!argument.startsWith('-') || argument === '-') {
        if (selectedFile !== undefined) invalid();
        selectedFile = argument;
        continue;
      }
      if (seen.has(argument)) invalid();
      seen.add(argument);
      if (argument === '--json') {
        json = true;
        continue;
      }
      if (
        ![
          '--company',
          '--runtime',
          '--source-directory',
          '--actor',
          '--scope',
        ].includes(argument)
      )
        invalid();
      const value = args[++index];
      if (!value || value.startsWith('--') || value.includes('\0')) invalid();
      if (argument === '--company') company = value;
      else if (argument === '--runtime') runtime = value;
      else if (argument === '--source-directory') sources = value;
      else if (argument === '--actor') actor = value;
      else selectedScope = value;
    }
    if (!selectedFile || selectedFile.includes('\0')) invalid();
    file = selectedFile;
    runtimePath = absolute(runtime);
    sourceDirectory = absolute(sources);
    if (
      !actor ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        actor,
      )
    )
      invalid();
    actorId = actor;
    scope = parseInboxScope(selectedScope);
  } catch {
    return {
      stdout: '',
      stderr: 'Invalid ingest options. Run mz ingest --help.\n',
      exitCode: 2,
    };
  }
  let state: RuntimeState | undefined;
  let result: CliResult;
  try {
    await loadCompanyRepository(
      company === undefined ? {} : { directory: company },
    );
    state = openRuntimeState({ path: runtimePath, existingOnly: true });
    const imported = await ingestMarkdown({
      state,
      sourceDirectory,
      actorId,
      scope,
      source:
        file === '-'
          ? { type: 'stdin', stream: process.stdin }
          : { type: 'file', path: resolve(file) },
    });
    result = {
      stdout: json
        ? JSON.stringify(imported) + '\n'
        : `Ingested inbox ${imported.item.id}\nSource ${imported.item.sourceId} (${imported.intake.sourceType}, ${imported.intake.sourceBytes} bytes), scope ${imported.intake.scope}\nSummary pending; untrusted source retained privately.\n`,
      stderr: '',
      exitCode: 0,
    };
  } catch {
    result = {
      stdout: '',
      stderr:
        'Intake failed. Check company/existing state, private storage, and UTF-8 input (1 MiB maximum). Run mz ingest --help.\n',
      exitCode: 1,
    };
  } finally {
    try {
      state?.close();
    } catch {
      result = {
        stdout: '',
        stderr:
          'Intake database finalization failed; inspect committed inbox history before retrying.\n',
        exitCode: 1,
      };
    }
  }
  return result;
}
