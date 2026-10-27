import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';
const entry = fileURLToPath(
  new URL('../packages/cli/dist/main.js', import.meta.url),
);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'mz-doctor-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'company.yaml'),
    'schemaVersion: 1\nid: example\nname: Example\n',
  );
  const runtime = join(root, 'runtime.sqlite3');
  core.openRuntimeState({ path: runtime }).close();
  return { root, runtime };
}
function run(args, env = {}) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: tmpdir(),
    env: { PATH: '/nonexistent', ...env },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.ifError(result.error);
  return result;
}
for (const format of ['text', 'json']) {
  test(`doctor emits ${format} health and exit 1 for unavailable integrations`, (t) => {
    const f = fixture(t);
    const result = run([
      'doctor',
      '--company',
      f.root,
      '--runtime',
      f.runtime,
      ...(format === 'json' ? ['--json'] : []),
    ]);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, '');
    assert.doesNotMatch(result.stdout, /mz-doctor-cli-|Error:|stack/);
    if (format === 'json') {
      const report = JSON.parse(result.stdout);
      assert.equal(report.healthy, false);
      assert.equal(
        report.checks.find((c) => c.id === 'runtime').status,
        'pass',
      );
    } else {
      assert.match(result.stdout, /runtime/);
      assert.match(result.stdout, /backup.freshness/);
      assert.match(result.stdout, /unavailable/);
    }
  });
}
test('doctor honors company/runtime environment selections', (t) => {
  const f = fixture(t);
  const r = run(['doctor', '--json'], {
    MZ_COMPANY_DIR: f.root,
    MZ_RUNTIME_DB: f.runtime,
  });
  assert.equal(r.status, 1);
  const c = JSON.parse(r.stdout).checks;
  assert.equal(c.find((c) => c.id === 'company').status, 'pass');
  assert.equal(c.find((c) => c.id === 'runtime').status, 'pass');
});
for (const args of [
  ['--runtime'],
  ['--runtime', 'relative'],
  ['--json', '--json'],
  ['--github-auth', 'synthetic-doctor-secret'],
  ['--backup-max-age-hours', '0'],
  ['--backup-max-age-hours', 'NaN'],
  ['--secret-binding', 'synthetic-doctor-secret'],
  ['--secret-directory', '/private'],
  ['--secret-binding', 'host:example=key'],
  ['--runtime', '/one', '--runtime', '/two'],
  ['--unknown', 'synthetic-doctor-secret'],
]) {
  test(
    'invalid doctor invocation fails safely: ' + JSON.stringify(args),
    () => {
      const r = run(['doctor', ...args]);
      assert.equal(r.status, 2);
      assert.equal(r.stdout, '');
      assert.match(r.stderr, /mz doctor --help/);
      assert.doesNotMatch(r.stderr, /synthetic-doctor-secret|\/private|\/one/);
    },
  );
}
test('doctor help does not run diagnostics or require configuration', () => {
  const r = run(['doctor', '--help']);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /--runtime/);
  assert.match(r.stdout, /--github-auth/);
  assert.doesNotMatch(r.stdout, /github.integration/);
});

test('real subprocess probes bound runtime and discard output, including stderr', (t) => {
  const f = fixture(t);
  for (const command of ['npm', 'git', 'gh', 'codex', 'tmux']) {
    const body =
      command === 'npm'
        ? 'setInterval(() => {}, 1000);'
        : command === 'git'
          ? "process.stdout.write('x'.repeat(8192));"
          : "process.stdout.write('synthetic-doctor-secret'); process.stderr.write('synthetic-doctor-secret');";
    writeFileSync(
      join(f.root, command),
      '#!' + process.execPath + '\n' + body + '\n',
      { mode: 0o700 },
    );
  }
  const started = Date.now();
  const r = spawnSync(
    process.execPath,
    [entry, 'doctor', '--company', f.root, '--runtime', f.runtime, '--json'],
    { cwd: tmpdir(), env: { PATH: f.root }, encoding: 'utf8', timeout: 12000 },
  );
  assert.ifError(r.error);
  assert.equal(r.status, 1);
  assert.equal(r.stderr, '');
  assert.ok(Date.now() - started < 11000);
  assert.doesNotMatch(r.stdout, /synthetic-doctor-secret/);
  const c = JSON.parse(r.stdout).checks;
  assert.equal(c.find((c) => c.id === 'tool.npm').status, 'fail');
  assert.equal(c.find((c) => c.id === 'tool.git').status, 'fail');
  assert.equal(c.find((c) => c.id === 'tool.codex').status, 'pass');
});
