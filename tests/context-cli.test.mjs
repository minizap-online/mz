import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { contextFixture } from './helpers/context-fixture.mjs';
const entry = fileURLToPath(
  new URL('../packages/cli/dist/main.js', import.meta.url),
);
function run(args, env = {}) {
  const r = spawnSync(process.execPath, [entry, 'context', ...args], {
    cwd: tmpdir(),
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.ifError(r.error);
  return r;
}
for (const json of [false, true])
  test(
    'context CLI emits complete private context ' + (json ? 'JSON' : 'text'),
    async (t) => {
      const f = await contextFixture(t);
      const args = [
        '--role',
        'developer',
        '--project',
        'alpha',
        '--task',
        'job',
        ...(json ? ['--json'] : []),
      ];
      const first = run(args, { MZ_COMPANY_DIR: f.root });
      assert.equal(first.status, 0, first.stderr);
      assert.equal(first.stderr, '');
      assert.match(first.stdout, /Selected task/);
      assert.doesNotMatch(
        first.stdout,
        /UNRELATED_PROJECT_PRIVATE|UNRELATED_PROCESS_PRIVATE|mz-context-/,
      );
      const second = run([...args, '--company', f.root]);
      assert.equal(second.stdout, first.stdout);
      if (json) assert.equal(JSON.parse(first.stdout).sources.length, 16);
    },
  );
for (const args of [
  [],
  ['--role', 'developer'],
  ['--role', '../escape', '--task', 'job'],
  ['--role', 'developer', '--task', 'job', '--max-bytes', '0'],
  ['--role', 'developer', '--task', 'job', '--json', '--json'],
  ['--unknown', 'synthetic-context-private'],
])
  test(
    'invalid context invocation fails privately: ' + JSON.stringify(args),
    () => {
      const r = run(args);
      assert.equal(r.status, 2);
      assert.equal(r.stdout, '');
      assert.match(r.stderr, /mz context --help/);
      assert.doesNotMatch(r.stderr, /synthetic-context-private|escape/);
    },
  );
for (const kind of ['missing', 'budget', 'credential'])
  test(
    'context failure ' + kind + ' emits no partial source data',
    async (t) => {
      const f = await contextFixture(t);
      const args = [
        '--role',
        'developer',
        '--project',
        'alpha',
        '--task',
        'job',
      ];
      if (kind === 'missing') await rm(join(f.root, 'AUTHORITY.md'));
      if (kind === 'budget') args.push('--max-bytes', '1024');
      if (kind === 'credential')
        await writeFile(
          join(f.root, 'COMPANY.md'),
          'Bearer synthetic-context-private',
        );
      const r = run(args, { MZ_COMPANY_DIR: f.root });
      assert.equal(r.status, 1);
      assert.equal(r.stdout, '');
      assert.doesNotMatch(
        r.stderr,
        /Selected task|synthetic-context-private|mz-context-/,
      );
    },
  );
test('context help needs no company or role/task configuration', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /--role/);
  assert.match(r.stdout, /--max-bytes/);
});
