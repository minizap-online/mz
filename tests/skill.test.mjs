import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { parseDocument } from 'yaml';
const skillPath = fileURLToPath(
  new URL('../packages/skill/SKILL.md', import.meta.url),
);
const entry = fileURLToPath(
  new URL('../packages/cli/dist/main.js', import.meta.url),
);
function content() {
  return readFileSync(skillPath, 'utf8');
}
function run(args, env = {}) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: tmpdir(),
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.ifError(result.error);
  return result;
}
test('repository skill has a valid portable discovery entrypoint', () => {
  const text = content();
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(frontmatter);
  const doc = parseDocument(frontmatter[1]);
  assert.deepEqual(doc.errors, []);
  const metadata = doc.toJS();
  assert.equal(metadata.name, 'mz');
  assert.equal(typeof metadata.description, 'string');
  assert.ok(
    metadata.description.length > 0 && metadata.description.length <= 1024,
  );
  for (const [, target] of text.matchAll(/\]\(([^)]+)\)/g)) {
    assert.ok(!target.startsWith('/'));
    if (!target.includes('://') && !target.startsWith('#'))
      assert.ok(
        existsSync(resolve(dirname(skillPath), target.split('#')[0])),
        target,
      );
  }
});
test('interfaces documented as Available are actually implemented without company configuration', () => {
  const text = content();
  const available = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((s) => s.trim());
    if (cells[0] !== 'Available') continue;
    const command = /^`(mz[^`]+)`$/.exec(cells[1]);
    assert.ok(command, 'Available interface must name one concrete CLI prefix');
    available.push(command[1]);
  }
  assert.ok(available.length > 0);
  for (const command of available) {
    const args = command.split(/\s+/).slice(1);
    const r = run(
      args.some((a) => a === '--help' || a === '--version')
        ? args
        : [...args, '--help'],
    );
    assert.equal(r.status, 0, command + ': ' + r.stderr);
    assert.equal(r.stderr, '');
  }
});
test('skill planning example compiles bounded selected-project context through the real CLI', () => {
  const text = content();
  const examples = [...text.matchAll(/```sh\n([\s\S]*?)```/g)];
  assert.equal(examples.length, 1);
  const command = examples[0][1].trim();
  assert.ok(command.startsWith('mz '));
  assert.ok(!/[;&|<>`$]/.test(command));
  const args = command.split(/\s+/).slice(1);
  const r = run(args, {
    MZ_COMPANY_DIR: fileURLToPath(
      new URL('../templates/company', import.meta.url),
    ),
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  const bundle = JSON.parse(r.stdout);
  assert.equal(bundle.selection.role, 'developer');
  assert.equal(bundle.selection.project, 'example-project');
  assert.equal(bundle.selection.task, 'review');
  assert.ok(
    bundle.sources.some(
      (s) => s.path === 'projects/example-project/tasks/review.md',
    ),
  );
  assert.ok(
    !bundle.sources.some((s) => s.path.startsWith('projects/another-project/')),
  );
  assert.ok(Buffer.byteLength(r.stdout) <= 65536);
});
