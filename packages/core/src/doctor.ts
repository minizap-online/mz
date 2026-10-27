import { containsObviousCredential } from './secrets/checks.js';
import { isAbsolute } from 'node:path';
import { inspectSqliteRuntimeState, type RuntimeInspection } from '@mz/state';
import { loadCompanyRepository } from './company/repository.js';
import type { CompanyRepositoryOptions } from './company/types.js';
import { defaultDoctorHost, type DoctorHost } from './doctor-host.js';
import { createHostFileSecretProvider } from './secrets/host-files.js';
import {
  parseSecretRef,
  type HostFileSecretProviderOptions,
} from './secrets/types.js';
export interface DoctorOptions {
  company?: CompanyRepositoryOptions;
  runtimePath?: string;
  backupMaxAgeMs?: number;
  now?: string;
  secrets?: HostFileSecretProviderOptions;
  githubAuth?: boolean;
}
export interface DoctorCheck {
  id: string;
  status: 'pass' | 'fail' | 'unavailable';
  summary: string;
  action: string;
  ageMs?: number | null;
}
export interface DoctorReport {
  healthy: boolean;
  checks: DoctorCheck[];
}
export class DoctorError extends Error {
  readonly code = 'INVALID_DOCTOR_OPTIONS';
  constructor() {
    super(
      'Use documented doctor options with valid paths, positive age policy and symbolic secret bindings.',
    );
    this.name = 'DoctorError';
  }
}
function data(
  input: unknown,
  fields?: readonly string[],
): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new DoctorError();
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null)
    throw new DoctorError();
  const values: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || (fields && !fields.includes(key)))
      throw new DoctorError();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) throw new DoctorError();
    values[key] = descriptor.value;
  }
  return values;
}
function validate(input: unknown): DoctorOptions {
  try {
    const values = data(input, [
      'company',
      'runtimePath',
      'backupMaxAgeMs',
      'now',
      'secrets',
      'githubAuth',
    ]);
    if (values['company'] !== undefined)
      data(values['company'], ['directory', 'cwd', 'env']);
    if (
      values['runtimePath'] !== undefined &&
      (typeof values['runtimePath'] !== 'string' ||
        !isAbsolute(values['runtimePath']) ||
        values['runtimePath'].includes('\0'))
    )
      throw new DoctorError();
    if (
      values['backupMaxAgeMs'] !== undefined &&
      (typeof values['backupMaxAgeMs'] !== 'number' ||
        !Number.isSafeInteger(values['backupMaxAgeMs']) ||
        values['backupMaxAgeMs'] <= 0)
    )
      throw new DoctorError();
    if (
      values['githubAuth'] !== undefined &&
      typeof values['githubAuth'] !== 'boolean'
    )
      throw new DoctorError();
    if (values['secrets'] !== undefined) {
      const secrets = data(values['secrets'], ['directory', 'bindings']);
      const directory = secrets['directory'];
      if (
        typeof directory !== 'string' ||
        !isAbsolute(directory) ||
        directory.includes('\0')
      )
        throw new DoctorError();
      const bindings = data(secrets['bindings']);
      if (Object.keys(bindings).length === 0) throw new DoctorError();
      for (const [ref, filename] of Object.entries(bindings)) {
        parseSecretRef(ref);
        if (
          typeof filename !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(filename)
        )
          throw new DoctorError();
      }
      values['secrets'] = { directory, bindings };
    }
    const now = values['now'];
    if (
      now !== undefined &&
      (typeof now !== 'string' ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(now) ||
        new Date(now).toISOString() !== now)
    )
      throw new DoctorError();
    return values as DoctorOptions;
  } catch {
    throw new DoctorError();
  }
}

/** Read-only diagnostic orchestration; injected host code is trusted, never a capability sandbox. */
export async function runDoctor(
  input: DoctorOptions = {},
  host: DoctorHost = defaultDoctorHost,
): Promise<DoctorReport> {
  const options = validate(input);
  const checks: DoctorCheck[] = [];
  const add = (
    id: string,
    status: DoctorCheck['status'],
    summary: string,
    action: string,
    extra: Pick<DoctorCheck, 'ageMs'> = {},
  ): void => {
    checks.push({ id, status, summary, action, ...extra });
  };
  try {
    const company = await loadCompanyRepository(options.company ?? {});
    add(
      'company',
      'pass',
      'Company configuration is available.',
      'Keep organization context in the private company repository.',
    );
    const suspect =
      containsObviousCredential(company.config.id) ||
      containsObviousCredential(company.config.name);
    add(
      'config.secrets',
      suspect ? 'fail' : 'pass',
      suspect
        ? 'Company config contains an obvious credential-like value.'
        : 'No obvious credential patterns found in supported company fields.',
      suspect
        ? 'Remove the value, rotate any exposed credential, and use symbolic secret references.'
        : 'Keep credentials outside config; this heuristic is not an assurance scan.',
    );
  } catch {
    add(
      'company',
      'fail',
      'Company configuration is unavailable or invalid.',
      'Set MZ_COMPANY_DIR or --company to a valid private repository; check company.yaml schema.',
    );
    add(
      'config.secrets',
      'unavailable',
      'Company config could not be checked.',
      'Correct company configuration before inspecting credential patterns.',
    );
  }
  let runtime: RuntimeInspection | undefined;
  if (!options.runtimePath) {
    add(
      'runtime',
      'unavailable',
      'Runtime database is not configured.',
      'Set MZ_RUNTIME_DB or --runtime to an existing absolute control-plane database.',
    );
  } else {
    try {
      runtime = inspectSqliteRuntimeState({
        path: options.runtimePath,
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.backupMaxAgeMs === undefined
          ? {}
          : { maxAgeMs: options.backupMaxAgeMs }),
      });
      add(
        'runtime',
        'pass',
        'Existing runtime schema, WAL and integrity checks passed.',
        'Keep runtime storage persistent outside disposable workers.',
      );
    } catch {
      add(
        'runtime',
        'fail',
        'Existing runtime database failed access, schema, WAL or integrity checks.',
        'Verify the configured existing file and release; initialize or migrate explicitly through the control plane, never by doctor.',
      );
    }
  }
  if (!runtime) {
    add(
      'backup.freshness',
      'unavailable',
      'Backup freshness is unavailable.',
      'Restore runtime access before evaluating durable backup history.',
    );
    add(
      'backup.latest-attempt',
      'unavailable',
      'Latest backup attempt is unavailable.',
      'Restore runtime access before inspecting backup attempts.',
    );
  } else {
    const health = runtime.backupFreshness;
    const summaries = {
      never: 'No successful backup is recorded.',
      fresh: 'Successful snapshot data is within the age policy.',
      stale: 'Successful snapshot data is older than the age policy.',
      'clock-skew': 'Successful snapshot start is in the future.',
    };
    add(
      'backup.freshness',
      health.status === 'fresh' ? 'pass' : 'fail',
      summaries[health.status],
      health.status === 'fresh'
        ? 'Verify off-host storage and periodic restoration independently.'
        : health.status === 'clock-skew'
          ? 'Check host clocks and backup timestamps.'
          : 'Run and verify the configured encrypted off-host backup; investigate failures and scheduling.',
      { ageMs: health.ageMs },
    );
    const outcome = health.latestAttempt?.outcome;
    add(
      'backup.latest-attempt',
      outcome === 'succeeded' ? 'pass' : 'fail',
      outcome === 'succeeded'
        ? 'Latest backup attempt succeeded.'
        : outcome === 'failed'
          ? 'Latest backup attempt failed.'
          : health.latestAttempt
            ? 'Latest backup attempt is pending.'
            : 'No backup attempt is recorded.',
      outcome === 'succeeded'
        ? 'Continue monitoring backup outcomes.'
        : 'Reconcile running/interrupted attempts and external storage before retrying or cleaning staging.',
    );
  }
  if (!options.secrets) {
    add(
      'secrets.access',
      'unavailable',
      'Host secret provider is not configured.',
      'Supply --secret-directory and at least one --secret-binding symbolic-ref=filename.',
    );
  } else {
    try {
      const provider = await createHostFileSecretProvider(options.secrets);
      const refs = Object.keys(options.secrets.bindings);
      if (!refs.length) throw new Error();
      for (const ref of refs) {
        const handle = await provider.resolve(parseSecretRef(ref));
        handle.dispose();
      }
      add(
        'secrets.access',
        'pass',
        'Configured host secret bindings are accessible.',
        'Maintain private file permissions and scoped secret use; no values were revealed.',
      );
    } catch {
      add(
        'secrets.access',
        'fail',
        'Configured host secret access failed.',
        'Check symbolic bindings, ownership, private directory/file permissions and credential provisioning.',
      );
    }
  }
  const tools = new Map<string, boolean>();
  const major = /^v?(\d+)\./.exec(host.nodeVersion)?.[1];
  tools.set('node', major !== undefined && Number(major) >= 24);
  add(
    'tool.node',
    tools.get('node') ? 'pass' : 'fail',
    tools.get('node')
      ? 'Node runtime meets the version requirement.'
      : 'Node runtime is unsupported.',
    'Use Node.js 24 or newer.',
  );
  for (const [command, args] of [
    ['npm', ['--version']],
    ['git', ['--version']],
    ['gh', ['--version']],
    ['codex', ['--version']],
    ['tmux', ['-V']],
  ] as const) {
    let ok = false;
    try {
      const result = await host.probeCommand(command, args);
      ok =
        result.ok === true &&
        (command !== 'npm' ||
          (typeof result.stdout === 'string' &&
            /^\d+\./.test(result.stdout) &&
            Number(result.stdout.split('.')[0]) >= 11));
    } catch {
      /* Static check output only. */
    }
    tools.set(command, ok);
    add(
      `tool.${command}`,
      ok ? 'pass' : 'fail',
      ok
        ? 'Required command probe succeeded.'
        : 'Required command probe failed or timed out.',
      command === 'npm'
        ? 'Install npm 11 or newer and ensure it is on PATH.'
        : command === 'codex'
          ? 'Install Codex and ensure it is available on the worker PATH.'
          : command === 'tmux'
            ? 'Install tmux and ensure it is available on the worker PATH.'
            : command === 'gh'
              ? 'Install GitHub CLI and ensure it is available on PATH.'
              : 'Install Git and ensure it is available on PATH.',
    );
  }
  const workerReady = [...tools.values()].every(Boolean);
  add(
    'devbox.tools',
    workerReady ? 'pass' : 'fail',
    workerReady
      ? 'Worker command prerequisites are available.'
      : 'Worker command prerequisites are incomplete.',
    'Resolve tool checks; use private DEVBOX.md to verify access, persistence and worker recovery separately.',
  );
  if (!options.githubAuth) {
    add(
      'github.auth',
      'unavailable',
      'Host GitHub authentication was not probed.',
      'Use --github-auth to opt into a read-only gh identity request with existing host credentials.',
    );
  } else if (!tools.get('gh')) {
    add(
      'github.auth',
      'unavailable',
      'GitHub CLI is unavailable for authentication probing.',
      'Install GitHub CLI, configure scoped host authentication, then rerun --github-auth.',
    );
  } else {
    let authenticated = false;
    try {
      authenticated =
        (await host.probeCommand('gh', ['api', 'user', '--silent'])).ok ===
        true;
    } catch {
      /* Do not retain authentication error details. */
    }
    add(
      'github.auth',
      authenticated ? 'pass' : 'fail',
      authenticated
        ? 'Host GitHub identity request succeeded.'
        : 'Host GitHub identity request failed or timed out.',
      authenticated
        ? 'Check repository permissions independently; identity access does not prove provider integration.'
        : 'Configure scoped gh host authentication and network access, then rerun --github-auth.',
    );
  }
  add(
    'github.integration',
    'unavailable',
    'The domain GitHub provider is an offline skeleton.',
    'Implement and verify remote provider integration before relying on work/source operations.',
  );
  return { healthy: checks.every((check) => check.status === 'pass'), checks };
}
