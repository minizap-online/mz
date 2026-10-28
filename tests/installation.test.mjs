import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  stat,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';
import { compileContext } from '../packages/context/dist/index.js';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mz-installation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configFile = join(root, 'settings/config.json');
  return {
    root,
    configFile,
    options: {
      configFile,
      companyDirectory: join(root, 'company'),
      stateDirectory: join(root, 'state'),
      id: 'sample-org',
      name: 'Sample Organization',
    },
  };
}
test('init supplies private remembered settings and a compilable company shell without example projects', async (t) => {
  const f = await fixture(t);
  assert.equal(
    await core.readLocalInstallation({ configFile: f.configFile }),
    null,
  );
  const first = await core.initializeLocalInstallation(f.options);
  assert.equal(first.backend, 'codex');
  assert.equal(first.schemaVersion, 1);
  assert.equal((await stat(f.configFile)).mode & 0o777, 0o600);
  for (const path of [first.sourceDirectory, first.artifactDirectory])
    assert.equal((await stat(path)).mode & 0o777, 0o700);
  const state = core.openRuntimeState({
    path: first.runtimePath,
    existingOnly: true,
  });
  assert.equal(state.getStatus().schemaVersion, 5);
  state.close();
  const company = await core.loadCompanyRepository({
    directory: first.companyDirectory,
  });
  for (const task of ['setup', 'steward']) {
    const context = await compileContext({ company, role: 'steward', task });
    assert.equal(context.selection.project, null);
    assert.match(context.text, /Sample Organization/);
  }
  assert.deepEqual(
    await core.readLocalInstallation({ configFile: f.configFile }),
    first,
  );
  assert.deepEqual(await core.initializeLocalInstallation(f.options), first);
  await assert.rejects(
    readFile(
      join(first.companyDirectory, 'projects/example-project/project.yaml'),
    ),
  );
});
test('attach preserves existing knowledge and rejects conflicting settings instead of resetting', async (t) => {
  const f = await fixture(t);
  await mkdir(f.options.companyDirectory, { mode: 0o700 });
  await writeFile(
    join(f.options.companyDirectory, 'COMPANY.md'),
    'Owner context already exists.\n',
  );
  const config = await core.initializeLocalInstallation(f.options);
  assert.equal(
    await readFile(join(config.companyDirectory, 'COMPANY.md'), 'utf8'),
    'Owner context already exists.\n',
  );
  await assert.rejects(
    core.initializeLocalInstallation({
      ...f.options,
      companyDirectory: join(f.root, 'other'),
    }),
  );
  assert.deepEqual(
    await core.readLocalInstallation({ configFile: f.configFile }),
    config,
  );
});
test('config rejects links, unknown fields, unsafe identities and runtime storage in Git', async (t) => {
  const f = await fixture(t);
  const config = await core.initializeLocalInstallation(f.options);
  await writeFile(
    f.configFile,
    JSON.stringify({ ...config, apiKey: 'synthetic-private-marker' }),
    { mode: 0o600 },
  );
  await assert.rejects(
    core.readLocalInstallation({ configFile: f.configFile }),
    (e) => {
      assert.doesNotMatch(e.stack, /synthetic-private-marker|mz-installation-/);
      return true;
    },
  );
  await rm(f.configFile);
  await writeFile(join(f.root, 'other.json'), JSON.stringify(config), {
    mode: 0o600,
  });
  await symlink(join(f.root, 'other.json'), f.configFile);
  await assert.rejects(
    core.readLocalInstallation({ configFile: f.configFile }),
  );
  const g = await fixture(t);
  await mkdir(g.options.stateDirectory, { mode: 0o700 });
  await mkdir(join(g.options.stateDirectory, '.git'));
  await assert.rejects(core.initializeLocalInstallation(g.options));
});
test('init refuses state nested under company and refuses implementation checkouts without changing them', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    core.initializeLocalInstallation({
      ...f.options,
      stateDirectory: join(f.options.companyDirectory, '..runtime'),
    }),
  );
  const g = await fixture(t);
  await mkdir(g.options.companyDirectory, { mode: 0o755 });
  await writeFile(join(g.options.companyDirectory, 'package.json'), '{}');
  await writeFile(
    join(g.options.companyDirectory, 'MZ_IMPLEMENTATION_PLAN.md'),
    'implementation',
  );
  const before = (await stat(g.options.companyDirectory)).mode;
  await assert.rejects(core.initializeLocalInstallation(g.options));
  assert.equal((await stat(g.options.companyDirectory)).mode, before);
  await assert.rejects(
    readFile(join(g.options.companyDirectory, 'company.yaml')),
  );
});
test('attach rejects a conflicting marker and existing init does not claim success after storage loss', async (t) => {
  const f = await fixture(t);
  await mkdir(f.options.companyDirectory, { mode: 0o700 });
  await writeFile(
    join(f.options.companyDirectory, 'company.yaml'),
    'schemaVersion: 1\nid: actual-company\nname: Actual Company\n',
  );
  await assert.rejects(core.initializeLocalInstallation(f.options));
  const g = await fixture(t);
  const config = await core.initializeLocalInstallation(g.options);
  await rm(config.runtimePath);
  await assert.rejects(core.initializeLocalInstallation(g.options));
  await assert.rejects(readFile(config.runtimePath));
});
test('settings cannot be placed inside curated company knowledge', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    core.initializeLocalInstallation({
      ...f.options,
      configFile: join(f.options.companyDirectory, '.mz/config.json'),
    }),
  );
  await assert.rejects(
    readFile(join(f.options.companyDirectory, 'company.yaml')),
  );
});
