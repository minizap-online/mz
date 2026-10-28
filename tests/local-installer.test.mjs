import assert from 'node:assert/strict';
import { execFile as exec } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
  mkdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
const execute = promisify(exec),
  installer = resolve('scripts/install-local.mjs');
test('local development install works from another directory and is repeatable', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mz launcher with spaces-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await execute(process.execPath, [installer, '--prefix', root]);
  const launcher = join(root, 'bin/mz');
  assert.equal((await stat(launcher)).mode & 0o777, 0o755);
  assert.equal(
    (await execute(launcher, ['--version'], { cwd: tmpdir() })).stdout.trim(),
    '0.1.0',
  );
  assert.match(
    (await execute(launcher, ['init', '--help'], { cwd: tmpdir() })).stdout,
    /mz init/,
  );
  const before = await readFile(launcher, 'utf8');
  await execute(process.execPath, [installer, '--prefix', root]);
  assert.equal(await readFile(launcher, 'utf8'), before);
});
test('local installer preserves an unrelated existing command', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mz-existing-command-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'bin'));
  await writeFile(join(root, 'bin/mz'), 'owner command', { mode: 0o755 });
  await assert.rejects(
    execute(process.execPath, [installer, '--prefix', root]),
  );
  assert.equal(await readFile(join(root, 'bin/mz'), 'utf8'), 'owner command');
});
