import assert from 'node:assert/strict';
import { execFile as exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
const execute = promisify(exec),
  cli = resolve('packages/cli/dist/main.js');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mz-onboarding-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    root,
    env: {
      PATH: process.env.PATH,
      MZ_CONFIG_FILE: join(root, 'settings/config.json'),
      XDG_STATE_HOME: join(root, 'state'),
      XDG_DATA_HOME: join(root, 'data'),
    },
  };
}
async function run(f, args) {
  return execute(process.execPath, [cli, ...args], {
    env: f.env,
    cwd: tmpdir(),
  });
}
async function init(f) {
  return run(f, [
    'init',
    '--yes',
    '--company',
    join(f.root, 'company'),
    '--id',
    'sample-org',
    '--name',
    'Sample Organization',
  ]);
}
test('init/guide help is setup-free, non-TTY init gives useful recovery and explicit init is repeatable', async (t) => {
  const f = await fixture(t);
  for (const name of ['init', 'guide'])
    assert.match(
      (await run(f, [name, '--help'])).stdout,
      new RegExp('mz ' + name),
    );
  await assert.rejects(
    run(f, ['init']),
    (e) => e.code === 2 && /--yes|terminal/i.test(e.stderr),
  );
  assert.match((await init(f)).stdout, /mz guide/);
  const before = await readFile(f.env.MZ_CONFIG_FILE, 'utf8');
  await init(f);
  assert.equal(await readFile(f.env.MZ_CONFIG_FILE, 'utf8'), before);
  const status = JSON.parse((await run(f, ['status', '--json'])).stdout);
  assert.equal(status.company, 'sample-org');
  assert.equal(status.runtime.availability, 'available');
  const context = JSON.parse(
    (
      await run(f, [
        'context',
        '--role',
        'steward',
        '--task',
        'setup',
        '--json',
      ])
    ).stdout,
  );
  assert.equal(context.selection.company, 'sample-org');
});
test('saved defaults make intake usable without identities/paths and explicit overrides retain precedence', async (t) => {
  const f = await fixture(t);
  await init(f);
  const file = join(f.root, 'idea.md');
  await writeFile(file, 'A synthetic owner idea.');
  const result = JSON.parse(
    (await run(f, ['ingest', file, '--scope', 'project-candidate', '--json']))
      .stdout,
  );
  const view = JSON.parse(
    (await run(f, ['inbox', 'inspect', result.item.id, '--json'])).stdout,
  );
  assert.equal(view.scope, 'project-candidate');
  const other = join(f.root, 'other');
  await mkdir(other);
  await writeFile(
    join(other, 'company.yaml'),
    'schemaVersion: 1\nid: other\nname: Other\n',
  );
  assert.equal(
    JSON.parse((await run(f, ['status', '--company', other, '--json'])).stdout)
      .company,
    'other',
  );
  assert.equal(
    JSON.parse(
      (
        await execute(process.execPath, [cli, 'status', '--json'], {
          env: { ...f.env, MZ_COMPANY_DIR: other },
        })
      ).stdout,
    ).company,
    'other',
  );
});
test('help ignores malformed saved settings while normal commands reject them without leaking details', async (t) => {
  const f = await fixture(t);
  await init(f);
  await writeFile(f.env.MZ_CONFIG_FILE, '{synthetic-private-config');
  assert.match((await run(f, ['--help'])).stdout, /mz init/);
  assert.match((await run(f, ['guide', '--help'])).stdout, /mz guide/);
  await assert.rejects(run(f, ['status', '--json']), (e) => {
    assert.doesNotMatch(
      e.stderr,
      /synthetic-private-config|mz-onboarding-cli-/,
    );
    return e.code === 1;
  });
});
test('structured API help remains discoverable without settings or terminal', async (t) => {
  const f = await fixture(t);
  const result = await run(f, ['ask', '--api-help']);
  assert.match(result.stdout, /MZ_STEWARD_MODEL/);
  assert.match(result.stdout, /--role/);
});
