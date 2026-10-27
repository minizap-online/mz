import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { link, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import * as context from '../packages/context/dist/index.js';
import { contextFixture } from './helpers/context-fixture.mjs';
function failure(code) {
  return (e) => {
    assert.ok(e instanceof context.ContextError);
    assert.equal(e.code, code);
    assert.equal(e.cause, undefined);
    assert.doesNotMatch(
      JSON.stringify(e) + e.stack,
      /synthetic-context-private|mz-context-/,
    );
    return true;
  };
}

test('compiler combines only the selected source graph with normalized traceable digests', async (t) => {
  const f = await contextFixture(t);
  const result = await context.compileContext(f.options);
  assert.equal(result.schemaVersion, 1);
  assert.deepEqual(result.selection, {
    company: 'example',
    role: 'developer',
    project: 'alpha',
    task: 'job',
  });
  assert.equal(result.work.externalId, 'example/alpha#142');
  assert.equal(result.textBytes, Buffer.byteLength(result.text));
  const paths = result.sources.map((s) => s.path);
  assert.deepEqual(paths, [
    'company.yaml',
    'COMPANY.md',
    'AUTHORITY.md',
    'roles/developer.md',
    'processes/development.md',
    'processes/release.md',
    'projects/alpha/project.yaml',
    'projects/alpha/PROJECT.md',
    'projects/alpha/ARCHITECTURE.md',
    'projects/alpha/STATUS.md',
    'projects/alpha/DECISIONS.md',
    'policies/review.md',
    'policies/security-baseline.md',
    'decisions/policy-001.md',
    'decisions/project-rule.md',
    'projects/alpha/tasks/job.md',
  ]);
  const company = result.sources.find((s) => s.path === 'COMPANY.md');
  const normalized = JSON.stringify({
    body: 'Company essentials.\n',
    kind: 'markdown',
    metadata: {},
  });
  assert.equal(
    company.sha256,
    createHash('sha256').update(normalized).digest('hex'),
  );
  assert.equal(company.bytes, Buffer.byteLength(normalized));
  assert.doesNotMatch(
    result.text,
    /UNRELATED_PROJECT_PRIVATE|UNRELATED_PROCESS_PRIVATE|mz-context-/,
  );
  assert.match(result.text, /Alpha architecture/);
  assert.match(result.text, /Company decision/);
  assert.match(result.text, /Selected task/);
  assert.match(result.text, /separately assigned capabilities/);
});
test('output is deterministic across runs, roots, normalized line endings and metadata key order', async (t) => {
  const a = await contextFixture(t);
  const b = await contextFixture(t);
  const first = await context.compileContext(a.options);
  await writeFile(
    join(b.root, 'roles/developer.md'),
    '---\ndecisions: [policy-001]\npolicies: [review]\nprocesses: [development]\nrole: developer\n---\nDeveloper contract.\r\n',
  );
  assert.deepEqual(await context.compileContext(a.options), first);
  assert.deepEqual(await context.compileContext(b.options), first);
  await writeFile(join(a.root, 'processes/unrelated.md'), 'changed unrelated');
  await writeFile(
    join(a.root, 'projects/beta/PROJECT.md'),
    'changed unrelated',
  );
  assert.deepEqual(await context.compileContext(a.options), first);
});
test('company-level task isolates project material and includes its relevant process', async (t) => {
  const f = await contextFixture(t);
  const result = await context.compileContext({
    company: f.company,
    role: 'developer',
    task: 'global',
  });
  assert.equal(result.selection.project, null);
  assert.equal(result.work, null);
  assert.ok(result.sources.some((s) => s.path === 'processes/intake.md'));
  assert.ok(!result.sources.some((s) => s.path.startsWith('projects/')));
  assert.doesNotMatch(result.text, /Alpha project|UNRELATED_PROJECT/);
});
for (const [path, text] of [
  ['roles/developer.md', '---\nprocesses: [../escape]\n---\ntext'],
  ['projects/alpha/project.yaml', 'project: beta\n'],
  ['projects/alpha/tasks/job.md', '---\nproject: beta\n---\ntext'],
  ['roles/developer.md', '---\nrole: owner\n---\ntext'],
])
  test('scope/reference mismatch fails privately: ' + path, async (t) => {
    const f = await contextFixture(t);
    await writeFile(join(f.root, path), text);
    await assert.rejects(
      context.compileContext(f.options),
      failure('CONTEXT_SCOPE_VIOLATION'),
    );
  });
test('missing required authority/policy/task sources fail without partial contents or paths', async (t) => {
  const f = await contextFixture(t);
  await rm(join(f.root, 'AUTHORITY.md'));
  await assert.rejects(
    context.compileContext(f.options),
    failure('CONTEXT_SOURCE_FAILED'),
  );
});
test('both text and complete JSON are bounded and overflow never silently drops documents', async (t) => {
  const f = await contextFixture(t);
  const result = await context.compileContext(f.options);
  const jsonBytes = Buffer.byteLength(JSON.stringify(result) + '\n');
  assert.ok(jsonBytes > result.textBytes);
  await assert.rejects(
    context.compileContext({ ...f.options, maxBytes: jsonBytes - 1 }),
    failure('CONTEXT_BUDGET_EXCEEDED'),
  );
  assert.deepEqual(
    await context.compileContext({ ...f.options, maxBytes: jsonBytes }),
    result,
  );
  await writeFile(join(f.root, 'COMPANY.md'), 'x'.repeat(65536));
  await assert.rejects(
    context.compileContext(f.options),
    failure('CONTEXT_BUDGET_EXCEEDED'),
  );
});
test('reference list limits are enforced before additional sources are read', async (t) => {
  const f = await contextFixture(t);
  await writeFile(
    join(f.root, 'roles/developer.md'),
    '---\nprocesses: [' +
      Array.from({ length: 33 }, (_, i) => 'p' + i).join(',') +
      ']\n---\nrole',
  );
  await assert.rejects(
    context.compileContext(f.options),
    failure('CONTEXT_BUDGET_EXCEEDED'),
  );
});
for (const value of [
  'Bearer synthetic-context-private',
  'ghp_' + 'x'.repeat(36),
  '-----BEGIN PRIVATE KEY-----',
])
  test(
    'obvious source credentials are rejected without disclosure: ' +
      value.slice(0, 6),
    async (t) => {
      const f = await contextFixture(t);
      await writeFile(join(f.root, 'COMPANY.md'), value);
      await assert.rejects(
        context.compileContext(f.options),
        failure('CONTEXT_SECRET_DETECTED'),
      );
    },
  );
test('sensitive metadata requires symbolic references, which remain unresolved', async (t) => {
  const f = await contextFixture(t);
  const path = join(f.root, 'tasks/global.md');
  await writeFile(path, '---\nsecret: synthetic-context-private\n---\nTask.');
  await assert.rejects(
    context.compileContext({
      company: f.company,
      role: 'developer',
      task: 'global',
    }),
    failure('CONTEXT_SECRET_DETECTED'),
  );
  await writeFile(path, '---\nsecret: host:example\n---\nTask.');
  const result = await context.compileContext({
    company: f.company,
    role: 'developer',
    task: 'global',
  });
  assert.match(result.text, /host:example/);
});
test('bad options, metadata getters and hostile source errors are not evaluated or disclosed', async (t) => {
  const f = await contextFixture(t);
  let reads = 0;
  for (const extra of [
    { role: '../escape' },
    { maxBytes: 0 },
    { unknown: 'synthetic-context-private' },
  ])
    await assert.rejects(
      context.compileContext({ ...f.options, ...extra }),
      failure('INVALID_CONTEXT_OPTIONS'),
    );
  const company = {
    ...f.company,
    async readMarkdown(path) {
      if (path === 'COMPANY.md')
        return Object.defineProperty({ metadata: {} }, 'body', {
          enumerable: true,
          get() {
            reads++;
            throw new Error('synthetic-context-private');
          },
        });
      return f.company.readMarkdown(path);
    },
  };
  await assert.rejects(
    context.compileContext({ ...f.options, company }),
    failure('CONTEXT_SOURCE_FAILED'),
  );
  assert.equal(reads, 0);
  const hostile = {
    ...f.company,
    async readMarkdown() {
      throw new Proxy(
        {},
        {
          get() {
            reads++;
            throw new Error('synthetic-context-private');
          },
        },
      );
    },
  };
  await assert.rejects(
    context.compileContext({ ...f.options, company: hostile }),
    failure('CONTEXT_SOURCE_FAILED'),
  );
  assert.equal(reads, 0);
  assert.equal(
    await readFile(join(f.root, 'COMPANY.md'), 'utf8'),
    'Company essentials.\n',
  );
});

for (const kind of ['symlink', 'hardlink'])
  test(`selected project cannot alias another project with a ${kind}`, async (t) => {
    const f = await contextFixture(t);
    const selected = join(f.root, 'projects/alpha/ARCHITECTURE.md');
    await rm(selected);
    if (kind === 'symlink') await symlink('../beta/PROJECT.md', selected);
    else await link(join(f.root, 'projects/beta/PROJECT.md'), selected);
    await assert.rejects(
      context.compileContext(f.options),
      failure('CONTEXT_SOURCE_FAILED'),
    );
  });
test('total source graph limit fails before attempting excessive reference reads', async (t) => {
  const f = await contextFixture(t);
  await writeFile(
    join(f.root, 'roles/developer.md'),
    '---\nprocesses: [' +
      Array.from({ length: 32 }, (_, i) => 'process' + i).join(',') +
      ']\npolicies: [' +
      Array.from({ length: 32 }, (_, i) => 'policy' + i).join(',') +
      ']\n---\nRole.',
  );
  await assert.rejects(
    context.compileContext(f.options),
    failure('CONTEXT_BUDGET_EXCEEDED'),
  );
});

test('CR-only front matter preserves source graph/digests and still rejects role mismatch', async (t) => {
  const f = await contextFixture(t);
  const expected = await context.compileContext(f.options);
  const path = join(f.root, 'roles/developer.md');
  const original = await readFile(path, 'utf8');
  await writeFile(path, original.replace(/\n/g, '\r'));
  assert.deepEqual(await context.compileContext(f.options), expected);
  await writeFile(path, '---\rrole: owner\r---\rOwner material.');
  await assert.rejects(
    context.compileContext(f.options),
    failure('CONTEXT_SCOPE_VIOLATION'),
  );
});
test('metadata keys cannot bypass credential or control guards', async (t) => {
  const f = await contextFixture(t);
  const path = join(f.root, 'tasks/global.md');
  const token = 'ghp_' + 'x'.repeat(36);
  await writeFile(path, '---\n"' + token + '": harmless\n---\nTask.');
  await assert.rejects(
    context.compileContext({
      company: f.company,
      role: 'developer',
      task: 'global',
    }),
    failure('CONTEXT_SECRET_DETECTED'),
  );
  await writeFile(path, '---\n"unsafe\\u0001key": harmless\n---\nTask.');
  await assert.rejects(
    context.compileContext({
      company: f.company,
      role: 'developer',
      task: 'global',
    }),
    failure('CONTEXT_SOURCE_FAILED'),
  );
});
