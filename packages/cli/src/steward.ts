import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import {
  createHostFileSecretProvider,
  loadCompanyRepository,
  openRuntimeState,
  parseSecretRef,
  stewardText,
  type RuntimeState,
} from '@mz/core';
import { askSteward, createOpenAIWorker, getStewardStatus } from '@mz/context';
import type { CliResult } from './cli.js';
const statusHelp = `Usage: mz status [options]

Options:
  --company DIR    Private company repository (or MZ_COMPANY_DIR/discovery)
  --project ID     Selected project; omitted reports explicitly indexed organization
  --runtime FILE   Existing absolute runtime database (or MZ_RUNTIME_DB)
  --json           Emit JSON; output contains private curated evidence
  -h, --help       Show help without setup

Read-only. Missing evidence/runtime is unavailable. No live provider is connected.
Exit codes: 0 report produced, 1 unsafe/unreadable sources, 2 invalid invocation.
`;
const askHelp = `Usage: mz ask FILE --role ROLE --task TASK [options]
       mz ask - --role ROLE --task TASK [options]  Read question from stdin

Options:
  --company DIR             Private company repository (or MZ_COMPANY_DIR)
  --project ID              Selected project; omitted restricts context to company
  --role ROLE               Host-assigned role slug
  --task TASK               Curated task slug in assigned scope
  --runtime FILE            Existing absolute runtime database (or MZ_RUNTIME_DB)
  --artifact-directory DIR  Private 0700 storage outside Git (or MZ_STEWARD_DIR)
  --actor UUID              Assigned actor (or MZ_ACTOR_ID); identity grants no authority
  --worker UUID             Assigned worker (or MZ_WORKER_ID)
  --json                    Emit private advisory response and structural identities
  -h, --help                Show help without setup or reading input

Host configuration required: MZ_STEWARD_MODEL (explicit model),
MZ_STEWARD_MAX_OUTPUT_TOKENS (16–8192), MZ_STEWARD_SECRET_DIR (private directory
containing 0600 openai-steward bound to symbolic openai:steward).
Invoking ask sends bounded curated context/question/history to OpenAI and may incur
charges under the operator's existing authorization. No tools, automatic actions,
retries or model fallback. Question <=8192 UTF-8 bytes; request <=128 KiB;
response <=32 KiB; worker timeout 60 seconds. Proposals require separate approval.
Artifacts are retained privately; pending/orphan recovery is an operator task.
Exit codes: 0 recorded advisory response, 1 operation failed, 2 invalid invocation/config.
`;
function invalid(): never {
  throw new Error();
}
function absolute(value: string | undefined): string {
  if (!value || !isAbsolute(value) || value.includes('\0')) return invalid();
  return value;
}
function uuid(value: string | undefined): string {
  if (
    !value ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    return invalid();
  return value;
}
function slug(value: string | undefined): string {
  if (!value || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) return invalid();
  return value;
}
async function question(file: string): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  const add = (chunk: Uint8Array): void => {
    size += chunk.byteLength;
    if (size > 8192) invalid();
    chunks.push(Buffer.from(chunk));
  };
  if (file === '-') {
    for await (const chunk of process.stdin) add(chunk as Buffer);
  } else {
    const input = await open(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      if (!(await input.stat()).isFile()) invalid();
      const buffer = Buffer.alloc(8193);
      while (true) {
        const { bytesRead } = await input.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        add(buffer.subarray(0, bytesRead));
      }
    } finally {
      await input.close();
    }
  }
  return stewardText(
    new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks, size),
    ),
    8192,
  );
}
export async function runStewardCli(
  command: 'status' | 'ask',
  args: readonly string[],
): Promise<CliResult> {
  if (args.length === 1 && ['-h', '--help'].includes(args[0]!))
    return {
      stdout: command === 'status' ? statusHelp : askHelp,
      stderr: '',
      exitCode: 0,
    };
  const values: Record<string, string | undefined> = {
    runtime: process.env['MZ_RUNTIME_DB'],
    'artifact-directory': process.env['MZ_STEWARD_DIR'],
    actor: process.env['MZ_ACTOR_ID'],
    worker: process.env['MZ_WORKER_ID'],
  };
  let json = false,
    file: string | undefined,
    role: string | undefined,
    task: string | undefined,
    project: string | undefined,
    runtime: string | undefined,
    directory: string | undefined,
    actor: string | undefined,
    workerId: string | undefined,
    model: string | undefined,
    secretDirectory: string | undefined,
    tokens: number | undefined;
  try {
    const seen = new Set<string>();
    const allowed =
      command === 'status'
        ? ['company', 'project', 'runtime']
        : [
            'company',
            'project',
            'runtime',
            'artifact-directory',
            'actor',
            'worker',
            'role',
            'task',
          ];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (command === 'ask' && (!arg.startsWith('-') || arg === '-')) {
        if (file !== undefined) invalid();
        file = arg;
        continue;
      }
      if (seen.has(arg)) invalid();
      seen.add(arg);
      if (arg === '--json') {
        json = true;
        continue;
      }
      if (!arg.startsWith('--') || !allowed.includes(arg.slice(2))) invalid();
      const value = args[++i];
      if (!value || value.startsWith('--') || value.includes('\0')) invalid();
      values[arg.slice(2)] = value;
    }
    if (values['project'] !== undefined) project = slug(values['project']);
    if (values['runtime'] !== undefined) runtime = absolute(values['runtime']);
    if (command === 'ask') {
      if (!file || file.includes('\0')) invalid();
      role = slug(values['role']);
      task = slug(values['task']);
      runtime = absolute(runtime);
      directory = absolute(values['artifact-directory']);
      actor = uuid(values['actor']);
      workerId = uuid(values['worker']);
      model = process.env['MZ_STEWARD_MODEL'];
      if (!model || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(model))
        invalid();
      const limit = process.env['MZ_STEWARD_MAX_OUTPUT_TOKENS'];
      if (!limit || !/^\d+$/.test(limit)) invalid();
      tokens = Number(limit);
      if (!Number.isSafeInteger(tokens) || tokens < 16 || tokens > 8192)
        invalid();
      secretDirectory = absolute(process.env['MZ_STEWARD_SECRET_DIR']);
    }
  } catch {
    return {
      stdout: '',
      stderr: `Invalid ${command} options or host configuration. Run mz ${command} --help.\n`,
      exitCode: 2,
    };
  }
  let state: RuntimeState | undefined;
  try {
    const company = await loadCompanyRepository(
      values['company'] === undefined ? {} : { directory: values['company'] },
    );
    if (command === 'status') {
      const status = await getStewardStatus({
        company,
        ...(project === undefined ? {} : { project }),
        ...(runtime === undefined ? {} : { runtimePath: runtime }),
      });
      return {
        stdout: JSON.stringify(status, null, json ? undefined : 2) + '\n',
        stderr: '',
        exitCode: 0,
      };
    }
    const provider = await createHostFileSecretProvider({
      directory: secretDirectory!,
      bindings: { 'openai:steward': 'openai-steward' },
    });
    const worker = createOpenAIWorker({
      model: model!,
      maxOutputTokens: tokens!,
      resolveKey: () => provider.resolve(parseSecretRef('openai:steward')),
    });
    const input = await question(file!);
    state = openRuntimeState({ path: runtime!, existingOnly: true });
    const result = await askSteward({
      company,
      state,
      runtimePath: runtime!,
      artifactDirectory: directory!,
      actorId: actor!,
      workerId: workerId!,
      role: role!,
      task: task!,
      question: input,
      worker,
      ...(project === undefined ? {} : { project }),
    });
    state.close();
    state = undefined;
    return {
      stdout:
        (json
          ? ''
          : 'Advisory proposals; no actions applied. Keep this output private.\n') +
        JSON.stringify(result, null, json ? undefined : 2) +
        '\n',
      stderr: '',
      exitCode: 0,
    };
  } catch {
    return {
      stdout: '',
      stderr: `${command === 'ask' ? 'Steward operation' : 'Status capture'} failed. Check bounded input, private sources/storage, host configuration and runtime history. Details withheld. Run mz ${command} --help.\n`,
      exitCode: 1,
    };
  } finally {
    try {
      state?.close();
    } catch {
      /* Primary result reports operation failure. */
    }
  }
}
