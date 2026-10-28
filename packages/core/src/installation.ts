import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  open,
  realpath,
  link,
  unlink,
  opendir,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import {
  dirname,
  isAbsolute,
  join,
  resolve,
  relative,
  basename,
} from 'node:path';
import { loadCompanyRepository } from './company/repository.js';
import { privateHostDirectory } from './private-host-directory.js';
import { openRuntimeState } from './runtime.js';
import { stewardText } from './steward.js';
import { stewardSync, stewardUuid, stewardWrite } from './steward-artifacts.js';
export class InstallationError extends Error {
  constructor() {
    super(
      'MZ setup is unavailable or conflicts with existing files. Check private local paths and company selection; existing knowledge/settings were preserved.',
    );
    this.name = 'InstallationError';
  }
}
export interface LocalInstallation {
  schemaVersion: 1;
  backend: 'codex';
  companyDirectory: string;
  runtimePath: string;
  sourceDirectory: string;
  artifactDirectory: string;
  actorId: string;
  workerId: string;
}
export interface InitializeLocalInstallationOptions {
  configFile: string;
  companyDirectory: string;
  stateDirectory: string;
  id: string;
  name: string;
}
export function installationPaths(
  env: Readonly<Record<string, string | undefined>> = process.env,
): { configFile: string; stateDirectory: string; companyDirectory: string } {
  return {
    configFile:
      env['MZ_CONFIG_FILE'] ??
      join(
        env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'),
        'mz/config.json',
      ),
    stateDirectory: join(
      env['XDG_STATE_HOME'] ?? join(homedir(), '.local/state'),
      'mz',
    ),
    companyDirectory: join(
      env['XDG_DATA_HOME'] ?? join(homedir(), '.local/share'),
      'mz/company',
    ),
  };
}
function absolute(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !isAbsolute(value) ||
    value.includes('\0') ||
    resolve(value) !== value
  )
    throw new InstallationError();
  return value;
}
async function info(path: string): Promise<Stats | null> {
  try {
    return await lstat(path);
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return null;
    throw e;
  }
}
async function outsideGit(path: string): Promise<void> {
  let current = path;
  while (true) {
    if (await info(join(current, '.git'))) throw new InstallationError();
    if (
      (await info(join(current, 'HEAD'))) &&
      (await info(join(current, 'objects')))?.isDirectory() &&
      (await info(join(current, 'refs')))?.isDirectory()
    )
      throw new InstallationError();
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
async function privateDirectory(path: string): Promise<string> {
  await mkdir(absolute(path), { recursive: true, mode: 0o700 });
  return privateHostDirectory(path);
}
function validate(value: unknown): LocalInstallation {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new InstallationError();
  const record = value as Record<string, unknown>;
  const keys = [
    'schemaVersion',
    'backend',
    'companyDirectory',
    'runtimePath',
    'sourceDirectory',
    'artifactDirectory',
    'actorId',
    'workerId',
  ];
  if (
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !keys.includes(key)) ||
    record['schemaVersion'] !== 1 ||
    record['backend'] !== 'codex'
  )
    throw new InstallationError();
  return {
    schemaVersion: 1,
    backend: 'codex',
    companyDirectory: absolute(record['companyDirectory']),
    runtimePath: absolute(record['runtimePath']),
    sourceDirectory: absolute(record['sourceDirectory']),
    artifactDirectory: absolute(record['artifactDirectory']),
    actorId: stewardUuid(record['actorId']),
    workerId: stewardUuid(record['workerId']),
  };
}
interface LocalBinding {
  schemaVersion: 1;
  companyDirectory: string;
  companyId: string;
  actorId: string;
  workerId: string;
}
function outside(root: string, path: string): boolean {
  const selected = relative(root, path);
  return (
    selected === '..' || selected.startsWith('../') || isAbsolute(selected)
  );
}
async function publicationAlias(
  path: string,
  stat: Stats,
): Promise<string | null> {
  if (stat.nlink !== 2) return null;
  const prefix = '.' + basename(path, '.json') + '-';
  const directory = await opendir(dirname(path));
  let count = 0;
  for await (const entry of directory) {
    if (++count > 128) throw new InstallationError();
    if (!entry.name.startsWith(prefix) || !entry.name.endsWith('.json'))
      continue;
    try {
      stewardUuid(entry.name.slice(prefix.length, -5));
    } catch {
      continue;
    }
    const candidate = join(dirname(path), entry.name);
    const other = await lstat(candidate);
    if (
      other.isFile() &&
      other.nlink === 2 &&
      other.ino === stat.ino &&
      other.dev === stat.dev &&
      other.uid === stat.uid &&
      (other.mode & 0o077) === 0
    )
      return candidate;
  }
  return null;
}
async function privateJson(path: string): Promise<unknown> {
  if ((await privateHostDirectory(dirname(path))) !== dirname(path))
    throw new InstallationError();
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      (stat.mode & 0o077) !== 0 ||
      (stat.uid !== 0 && stat.uid !== process.geteuid?.()) ||
      stat.size > 8192 ||
      (stat.nlink !== 1 && !(await publicationAlias(path, stat)))
    )
      throw new InstallationError();
    const bytes = Buffer.alloc(8193);
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await file.read(
        bytes,
        size,
        bytes.length - size,
        size,
      );
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > 8192) throw new InstallationError();
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)),
    );
  } finally {
    await file.close();
  }
}
async function recoverPublication(path: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.nlink === 1) return;
  const alias = await publicationAlias(path, stat);
  if (!alias) throw new InstallationError();
  await unlink(alias);
  await stewardSync(dirname(path));
}
async function removePublishedTemporary(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
}
async function publish(path: string, value: unknown): Promise<void> {
  const temporary = join(
    dirname(path),
    '.' + basename(path, '.json') + '-' + randomUUID() + '.json',
  );
  let created = false;
  try {
    await stewardWrite(temporary, JSON.stringify(value, null, 2) + '\n');
    created = true;
    await link(temporary, path);
    await stewardSync(dirname(path));
  } finally {
    if (created) await removePublishedTemporary(temporary);
  }
}
async function readBinding(stateRoot: string): Promise<LocalBinding> {
  const value = await privateJson(join(stateRoot, 'installation.json'));
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new InstallationError();
  const data = value as Record<string, unknown>;
  const keys = [
    'schemaVersion',
    'companyDirectory',
    'companyId',
    'actorId',
    'workerId',
  ];
  if (
    Object.keys(data).length !== keys.length ||
    Object.keys(data).some((key) => !keys.includes(key)) ||
    data['schemaVersion'] !== 1 ||
    typeof data['companyId'] !== 'string' ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(data['companyId'])
  )
    throw new InstallationError();
  return {
    schemaVersion: 1,
    companyDirectory: absolute(data['companyDirectory']),
    companyId: data['companyId'],
    actorId: stewardUuid(data['actorId']),
    workerId: stewardUuid(data['workerId']),
  };
}
async function checkBindings(
  settings: LocalInstallation,
  configFile: string,
): Promise<void> {
  const root = dirname(settings.runtimePath);
  if (
    !outside(settings.companyDirectory, configFile) ||
    !outside(settings.companyDirectory, root) ||
    basename(settings.runtimePath) !== 'runtime.sqlite3' ||
    settings.sourceDirectory !== join(root, 'sources') ||
    settings.artifactDirectory !== join(root, 'sessions')
  )
    throw new InstallationError();
  for (const path of [
    settings.companyDirectory,
    root,
    settings.sourceDirectory,
    settings.artifactDirectory,
  ]) {
    if ((await privateHostDirectory(path)) !== path)
      throw new InstallationError();
  }
  for (const path of [
    root,
    settings.sourceDirectory,
    settings.artifactDirectory,
    dirname(configFile),
  ])
    await outsideGit(path);
  const binding = await readBinding(root);
  const company = await loadCompanyRepository({
    directory: settings.companyDirectory,
    env: {},
  });
  if (
    binding.companyDirectory !== settings.companyDirectory ||
    binding.companyId !== company.config.id ||
    binding.actorId !== settings.actorId ||
    binding.workerId !== settings.workerId
  )
    throw new InstallationError();
}
export async function readLocalInstallation(
  options: { configFile?: string } = {},
): Promise<LocalInstallation | null> {
  try {
    const path = absolute(options.configFile ?? installationPaths().configFile);
    if (!(await info(path))) return null;
    const settings = validate(await privateJson(path));
    await checkBindings(settings, path);
    return settings;
  } catch {
    throw new InstallationError();
  }
}
async function seed(root: string, path: string, text: string): Promise<void> {
  const target = join(root, path);
  const existing = await info(target);
  if (existing) {
    if (!existing.isFile() || existing.nlink !== 1 || existing.size > 1048576)
      throw new InstallationError();
    return;
  }
  const parent = dirname(target);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  // Reject an existing directory alias before writing any source through it.
  let current = parent;
  while (current !== root) {
    const stat = await lstat(current);
    if (!stat.isDirectory()) throw new InstallationError();
    current = dirname(current);
  }
  await stewardWrite(target, text);
  await stewardSync(parent);
}
const shell: Record<string, string> = {
  'COMPANY.md':
    '# Company\n\nCompany context is not configured yet. Run mz guide to supply owner facts.\n',
  'AUTHORITY.md':
    "# Authority\n\nThe owner directs this company. Routine work requires an assigned scope. Context and identities alone grant no authority. Project activation, new spending, publication and permission changes require the owner's applicable approval.\n",
  'DEVBOX.md':
    '# Devbox\n\nNot described yet. Collect the actual environment in mz guide. Do not invent infrastructure or credentials.\n',
  'ASSETS.md':
    '# Assets\n\nNot inventoried yet. Record ownership and symbolic secret references, never secret values.\n',
  'ONBOARDING.md':
    '# Company onboarding\n\nStatus: not started\n\n## Accepted facts\n\nNone collected by this setup.\n\n## Open questions\n\nCompany purpose, devbox, workflows, owner involvement and first project.\n\n## Next step\n\nRun mz guide.\n',
  'policies/security-baseline.md':
    '# Security baseline\n\nKeep credential values out of Git, SQLite, context and logs. Use symbolic references and trusted Core secret handles. Keep company data private. Review actual project exposure and risk before publishing.\n',
  'processes/intake.md':
    '# Intake\n\nCapture owner ideas privately through mz ingest, review metadata through mz inbox, and link deliberately sanitized actionable work to the work provider. Triage does not activate a project.\n',
  'roles/developer.md':
    '---\nrole: developer\nprocesses: [intake]\n---\n# Developer\n\nImplement assigned approved work, verify it and return an honest handover. This role file does not start a worker or grant capabilities.\n',
  'roles/steward.md':
    "---\nrole: steward\nprocesses: [intake]\n---\n# Steward\n\nGuide the owner, preserve accepted company context, identify decisions, triage intake within approved scope and coordinate proposed work. Ask one question at a time and keep operational details out of the owner's path.\n",
  'tasks/setup.md':
    '---\nrole: steward\n---\n# Company setup\n\nRead existing company knowledge. Collect company purpose, devbox, workflows, desired owner involvement and first project through a conversation. Record accepted facts and unanswered questions privately. Never invent answers, activation or spending approval.\n',
  'tasks/steward.md':
    '---\nrole: steward\n---\n# Owner conversation\n\nExplain current evidence, discuss decisions and work, and maintain private curated context. Distinguish proposed work from applied changes. Use existing approved scope and keep unresolved prerequisites explicit.\n',
};
export async function initializeLocalInstallation(
  options: InitializeLocalInstallationOptions,
): Promise<LocalInstallation> {
  try {
    const configFile = absolute(options.configFile),
      selected = absolute(options.companyDirectory),
      stateRoot = absolute(options.stateDirectory);
    const configRelative = relative(selected, configFile);
    if (!(
      configRelative === '..' ||
      configRelative.startsWith('../') ||
      isAbsolute(configRelative)
    ))
      throw new InstallationError();
    const existing = await readLocalInstallation({ configFile });
    if (existing) {
      if (
        existing.companyDirectory !== selected ||
        dirname(existing.runtimePath) !== stateRoot
      )
        throw new InstallationError();
      const company = await loadCompanyRepository({ directory: selected });
      if (company.config.id !== options.id) throw new InstallationError();
      await recoverPublication(configFile);
      await recoverPublication(join(stateRoot, 'installation.json'));
      await outsideGit(stateRoot);
      for (const path of [
        stateRoot,
        existing.sourceDirectory,
        existing.artifactDirectory,
      ])
        await privateHostDirectory(path);
      const state = openRuntimeState({
        path: existing.runtimePath,
        existingOnly: true,
      });
      state.close();
      return existing;
    }
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(options.id))
      throw new InstallationError();
    const name = stewardText(options.name, 200);
    if (name.trim() !== name) throw new InstallationError();
    const stateRelative = relative(selected, stateRoot);
    if (!(
      stateRelative === '..' ||
      stateRelative.startsWith('../') ||
      isAbsolute(stateRelative)
    ))
      throw new InstallationError();
    await outsideGit(stateRoot);
    await outsideGit(dirname(configFile));
    const before = await info(selected);
    if (before && !before.isDirectory()) throw new InstallationError();
    if (before && before.uid !== 0 && before.uid !== process.geteuid?.())
      throw new InstallationError();
    await mkdir(selected, { recursive: true, mode: 0o700 });
    const companyRoot = await realpath(selected);
    if (companyRoot !== selected) throw new InstallationError();

    // Do not mistake the reusable implementation checkout for company knowledge.
    const packageFile = await info(join(selected, 'package.json'));
    if (
      packageFile &&
      (await info(join(selected, 'MZ_IMPLEMENTATION_PLAN.md')))
    )
      throw new InstallationError();
    if (before) await chmod(selected, before.mode & ~0o077);
    await seed(
      selected,
      'company.yaml',
      JSON.stringify({ schemaVersion: 1, id: options.id, name }, null, 2) +
        '\n',
    );
    const company = await loadCompanyRepository({ directory: selected });
    if (company.config.id !== options.id) throw new InstallationError();
    for (const [path, text] of Object.entries(shell))
      await seed(selected, path, text);
    await privateDirectory(stateRoot);
    const sourceDirectory = await privateDirectory(join(stateRoot, 'sources'));
    const artifactDirectory = await privateDirectory(
      join(stateRoot, 'sessions'),
    );
    const runtimePath = join(stateRoot, 'runtime.sqlite3');
    const bindingPath = join(stateRoot, 'installation.json');
    if (!(await info(bindingPath))) {
      if (await info(runtimePath)) throw new InstallationError();
      await publish(bindingPath, {
        schemaVersion: 1,
        companyDirectory: selected,
        companyId: company.config.id,
        actorId: randomUUID(),
        workerId: randomUUID(),
      });
    }
    const binding = await readBinding(stateRoot);
    if (
      binding.companyDirectory !== selected ||
      binding.companyId !== company.config.id
    )
      throw new InstallationError();
    await recoverPublication(bindingPath);
    const state = openRuntimeState({ path: runtimePath });
    state.close();
    await privateDirectory(dirname(configFile));
    const result: LocalInstallation = {
      schemaVersion: 1,
      backend: 'codex',
      companyDirectory: selected,
      runtimePath,
      sourceDirectory,
      artifactDirectory,
      actorId: binding.actorId,
      workerId: binding.workerId,
    };
    await publish(configFile, result);
    return result;
  } catch {
    throw new InstallationError();
  }
}
