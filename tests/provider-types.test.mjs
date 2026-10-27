import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('provider declarations accept neutral DTOs and reject vendor objects and invalid audits', () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../node_modules/typescript/bin/tsc', import.meta.url),
      ),
      '--ignoreConfig',
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2023',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      fileURLToPath(
        new URL('./fixtures/provider-contracts.mts', import.meta.url),
      ),
    ],
    { encoding: 'utf8', timeout: 30000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
