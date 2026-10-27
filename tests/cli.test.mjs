import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const entry = fileURLToPath(
  new URL('../packages/cli/dist/main.js', import.meta.url),
);
const metadata = JSON.parse(
  readFileSync(
    new URL('../packages/cli/package.json', import.meta.url),
    'utf8',
  ),
);
function run(args) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: tmpdir(),
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
    timeout: 5000,
  });
  assert.ifError(result.error);
  return result;
}

// Catch missing executable wiring, accidental config requirements, and cwd assumptions.
for (const args of [[], ['--help'], ['-h'], ['help']]) {
  test(`help works without company config: ${JSON.stringify(args)}`, () => {
    const result = run(args);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: mz/);
    assert.match(result.stdout, /--help/);
    assert.match(result.stdout, /--version/);
    assert.equal(result.stderr, '');
  });
}

// Catch stale version literals and accidental extra stdout/stderr.
for (const flag of ['--version', '-v']) {
  test(`prints installed package version: ${flag}`, () => {
    const result = run([flag]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${metadata.version}\n`);
    assert.equal(result.stderr, '');
  });
}

// Catch permissive parsing, misleading success for future commands, and argument disclosure.
for (const args of [
  ['unknown-command'],
  ['--unknown'],
  ['--help', 'extra'],
  ['--version', '--help'],
  ['private-input-marker'],
]) {
  test(`rejects unsupported invocation: ${JSON.stringify(args)}`, () => {
    const result = run(args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /mz --help/);
    assert.doesNotMatch(result.stderr, /private-input-marker/);
    assert.doesNotMatch(
      result.stderr,
      /ERR_MODULE_NOT_FOUND|Cannot find module/,
    );
  });
}
