import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

// Catch bin links targeting nonexistent build outputs during npm ci.
test('clean install exposes mz and the Core runtime API from another directory', () => {
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
    const statePath = join(fresh, 'runtime.sqlite3');
    const runtime = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { openRuntimeState, parseSecretRef, createHostFileSecretProvider, backupRuntimeState } from ${JSON.stringify(pathToFileURL(join(fresh, 'packages/core/dist/index.js')).href)};
      import { createGitHubProviderSkeleton } from ${JSON.stringify(pathToFileURL(join(fresh, 'packages/providers/github/dist/index.js')).href)};
      if (typeof createGitHubProviderSkeleton !== 'function') throw new Error('GitHub skeleton unavailable');
      const state = openRuntimeState({ path: ${JSON.stringify(statePath)} });
      if (state.getStatus().journalMode !== 'wal') throw new Error('WAL unavailable');
      if (state.getStatus().schemaVersion !== 2 || state.getBackupFreshness().status !== 'never' || !state.verifyIntegrity().ok || typeof backupRuntimeState !== 'function') throw new Error('backup API unavailable');
      state.close();
      if (parseSecretRef('host:example') !== 'host:example' || typeof createHostFileSecretProvider !== 'function') throw new Error('secret API unavailable');
    `,
      ],
      { cwd: tmpdir(), encoding: 'utf8', timeout: 5000 },
    );
    assert.ifError(runtime.error);
    assert.equal(runtime.status, 0, runtime.stderr);
    const doctor = spawnSync(
      join(fresh, 'node_modules/.bin/mz'),
      ['doctor', '--json'],
      {
        cwd: tmpdir(),
        encoding: 'utf8',
        env: { PATH: process.env.PATH, MZ_RUNTIME_DB: statePath },
        timeout: 45000,
      },
    );
    assert.ifError(doctor.error);
    assert.equal(doctor.status, 1, doctor.stderr);
    assert.equal(doctor.stderr, '');
    assert.equal(
      JSON.parse(doctor.stdout).checks.find((check) => check.id === 'runtime')
        .status,
      'pass',
    );
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }
});
