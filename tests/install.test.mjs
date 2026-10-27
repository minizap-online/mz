import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Catch bin links targeting nonexistent build outputs during npm ci.
test('clean install and build expose an executable mz from another directory', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const fresh = mkdtempSync(join(tmpdir(), 'mz-install-'));
  try {
    for (const name of [
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'tsconfig.base.json',
      'packages',
    ]) {
      cpSync(join(root, name), join(fresh, name), {
        recursive: true,
        filter: (source) =>
          !source
            .split('/')
            .some((part) => ['dist', 'node_modules'].includes(part)) &&
          !source.endsWith('.tsbuildinfo'),
      });
    }
    for (const args of [
      ['ci', '--offline'],
      ['run', 'build'],
    ]) {
      const result = spawnSync('npm', args, {
        cwd: fresh,
        encoding: 'utf8',
        timeout: 30000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    const result = spawnSync(
      join(fresh, 'node_modules/.bin/mz'),
      ['--version'],
      {
        cwd: tmpdir(),
        encoding: 'utf8',
        timeout: 5000,
      },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const metadata = JSON.parse(
      readFileSync(join(fresh, 'packages/cli/package.json'), 'utf8'),
    );
    assert.equal(result.stdout, `${metadata.version}\n`);
    assert.equal(result.stderr, '');
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }
});
