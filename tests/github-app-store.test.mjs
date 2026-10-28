import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  lstat,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as core from '../packages/core/dist/index.js';
test('private artifacts reject Git paths, aliases and loose files; exclusive writes preserve existing data', async (t) => {
  assert.equal(typeof core.readPrivateArtifact, 'function');
  const root = await mkdtemp(join(tmpdir(), 'mz-app-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'private'), { mode: 0o700 });
  const path = join(root, 'private/file');
  await core.writePrivateArtifact(path, 'one');
  assert.equal((await lstat(path)).mode & 0o777, 0o600);
  assert.equal((await core.readPrivateArtifact(path)).toString(), 'one');
  await assert.rejects(() => core.writePrivateArtifact(path, 'two'));
  assert.equal((await readFile(path)).toString(), 'one');
  await symlink(path, join(root, 'private/link'));
  await assert.rejects(() =>
    core.readPrivateArtifact(join(root, 'private/link')),
  );
  await mkdir(join(root, 'repo/.git'), { recursive: true });
  await assert.rejects(() =>
    core.writePrivateArtifact(join(root, 'repo/key'), 'secret'),
  );
  await writeFile(join(root, 'private/loose'), 'x', { mode: 0o644 });
  await assert.rejects(() =>
    core.readPrivateArtifact(join(root, 'private/loose')),
  );
});
