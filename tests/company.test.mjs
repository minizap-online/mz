import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';

const config = 'schemaVersion: 1\nid: sample-company\nname: Sample Company\n';
async function fixture(t, files = {}) {
  const root = await mkdtemp(join(tmpdir(), 'mz-company-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries({
    'company.yaml': config,
    ...files,
  })) {
    if (content === null) continue;
    await mkdir(resolve(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), content);
  }
  return root;
}
const load = (options) => core.loadCompanyRepository({ env: {}, ...options });
function failure(code, field) {
  return (error) => {
    assert.ok(error instanceof core.CompanyRepositoryError);
    assert.equal(error.code, code);
    if (field) assert.equal(error.field, field);
    assert.doesNotMatch(
      JSON.stringify(error) + error.stack,
      /private-source-marker/,
    );
    return true;
  };
}

test('loads a company by explicit path and canonicalizes the root', async (t) => {
  const root = await fixture(t);
  const company = await load({ directory: root + '/.' });
  assert.equal(company.root, root);
  assert.deepEqual(company.config, {
    schemaVersion: 1,
    id: 'sample-company',
    name: 'Sample Company',
  });
});

test('explicit directory wins over environment and relative paths use cwd', async (t) => {
  const root = await fixture(t);
  const company = await load({
    directory: '.',
    cwd: root,
    env: { MZ_COMPANY_DIR: '/missing-company' },
  });
  assert.equal(company.root, root);
});

test('environment can configure a relative company directory', async (t) => {
  const root = await fixture(t);
  const company = await load({ cwd: root, env: { MZ_COMPANY_DIR: '.' } });
  assert.equal(company.root, root);
});

test('discovers from nested directories without a git checkout', async (t) => {
  const root = await fixture(t, {
    'projects/example/PROJECT.md': '# Example\n',
  });
  assert.equal(
    (await load({ cwd: join(root, 'projects/example') })).root,
    root,
  );
});

test('nearest marker wins over an ancestor company', async (t) => {
  const root = await fixture(t, {
    'nested/company.yaml': config.replace('sample-company', 'nested-company'),
  });
  assert.equal(
    (await load({ cwd: join(root, 'nested') })).config.id,
    'nested-company',
  );
});

for (const [name, options, code] of [
  [
    'invalid explicit directory',
    (root) => ({ directory: join(root, 'absent'), cwd: root }),
    'INVALID_DIRECTORY',
  ],
  [
    'invalid environment directory',
    (root) => ({ cwd: root, env: { MZ_COMPANY_DIR: 'absent' } }),
    'INVALID_DIRECTORY',
  ],
  [
    'empty configured directory',
    (root) => ({ directory: '', cwd: root }),
    'INVALID_DIRECTORY',
  ],
  [
    'empty environment directory',
    (root) => ({ cwd: root, env: { MZ_COMPANY_DIR: '' } }),
    'INVALID_DIRECTORY',
  ],
  [
    'file used as directory',
    (root) => ({ directory: join(root, 'company.yaml') }),
    'INVALID_DIRECTORY',
  ],
]) {
  test(`${name} fails without falling back`, async (t) => {
    const root = await fixture(t);
    await assert.rejects(load(options(root)), failure(code));
  });
}

test('missing marker in explicitly configured repository fails', async (t) => {
  const root = await fixture(t, { 'company.yaml': null });
  await assert.rejects(load({ directory: root }), failure('CONFIG_NOT_FOUND'));
});

test('no marker found during discovery has an actionable error', async (t) => {
  const root = await fixture(t, { 'company.yaml': null });
  await assert.rejects(load({ cwd: root }), failure('COMPANY_NOT_FOUND'));
});

test('invalid nearest config never falls back to parent', async (t) => {
  const root = await fixture(t, {
    'nested/company.yaml': 'schemaVersion: 9\n',
  });
  await assert.rejects(
    load({ cwd: join(root, 'nested') }),
    failure('UNSUPPORTED_SCHEMA_VERSION', 'schemaVersion'),
  );
});

for (const [name, content, code, field] of [
  [
    'missing version',
    'id: sample\nname: Sample\n',
    'INVALID_CONFIG',
    'schemaVersion',
  ],
  [
    'unsupported version',
    'schemaVersion: 2\nid: sample\nname: Sample\n',
    'UNSUPPORTED_SCHEMA_VERSION',
    'schemaVersion',
  ],
  [
    'string version',
    'schemaVersion: "1"\nid: sample\nname: Sample\n',
    'INVALID_CONFIG',
    'schemaVersion',
  ],
  [
    'invalid id',
    config.replace('sample-company', '../private-source-marker'),
    'INVALID_CONFIG',
    'id',
  ],
  [
    'empty name',
    config.replace('name: Sample Company', 'name: ""'),
    'INVALID_CONFIG',
    'name',
  ],
  [
    'untrimmed name',
    config.replace('name: Sample Company', 'name: " Sample "'),
    'INVALID_CONFIG',
    'name',
  ],
  [
    'long name',
    config.replace('Sample Company', 'x'.repeat(201)),
    'INVALID_CONFIG',
    'name',
  ],
  [
    'long id',
    config.replace('sample-company', 'x'.repeat(65)),
    'INVALID_CONFIG',
    'id',
  ],
  [
    'unknown key',
    config + 'private-source-marker: hidden\n',
    'INVALID_CONFIG',
    undefined,
  ],
]) {
  test(`rejects config with ${name}`, async (t) => {
    const root = await fixture(t, { 'company.yaml': content });
    await assert.rejects(load({ directory: root }), failure(code, field));
  });
}

test('reads YAML mapping metadata and preserves YAML 1.2 values', async (t) => {
  const root = await fixture(t, {
    'roles/worker.yaml':
      'role: engineer\nprocesses: [development, release]\nenabled: true\nanswer: No\nextra: null\n',
  });
  const company = await load({ directory: root });
  assert.deepEqual(await company.readYaml('roles/worker.yaml'), {
    role: 'engineer',
    processes: ['development', 'release'],
    enabled: true,
    answer: 'No',
    extra: null,
  });
});

for (const [name, content, code] of [
  ['broken YAML', 'name: [private-source-marker\n', 'INVALID_YAML'],
  [
    'duplicate keys',
    'name: first\nname: private-source-marker\n',
    'INVALID_YAML',
  ],
  [
    'multiple documents',
    'name: first\n---\nname: private-source-marker\n',
    'INVALID_YAML',
  ],
  ['scalar root', 'private-source-marker', 'INVALID_METADATA'],
  ['sequence root', '[private-source-marker]', 'INVALID_METADATA'],
  ['complex key', '? [private-source-marker]\n: value\n', 'INVALID_METADATA'],
  ['numeric key', '12: private-source-marker', 'INVALID_METADATA'],
  ['unsafe object key', '__proto__: private-source-marker', 'INVALID_METADATA'],
  [
    'unsafe nested key',
    'nested: { constructor: private-source-marker }',
    'INVALID_METADATA',
  ],
  [
    'alias',
    'first: &value private-source-marker\nsecond: *value',
    'INVALID_METADATA',
  ],
  ['unknown tag', 'key: !unknown private-source-marker', 'INVALID_YAML'],
  ['nonfinite number', 'key: .inf', 'INVALID_METADATA'],
  [
    'old YAML version',
    '%YAML 1.1\n---\nkey: private-source-marker',
    'INVALID_YAML',
  ],
  [
    'excessive depth',
    'key: ' + '['.repeat(40) + 'private-source-marker' + ']'.repeat(40),
    'INVALID_METADATA',
  ],
]) {
  test(`rejects ${name} without source disclosure`, async (t) => {
    const root = await fixture(t, { 'bad.yaml': content });
    const company = await load({ directory: root });
    await assert.rejects(company.readYaml('bad.yaml'), failure(code));
  });
}

test('YAML syntax errors include source path and line/column without source values', async (t) => {
  const root = await fixture(t, {
    'bad.yaml': 'good: yes\nbad: [private-source-marker\n',
  });
  const company = await load({ directory: root });
  await assert.rejects(company.readYaml('bad.yaml'), (error) => {
    failure('INVALID_YAML')(error);
    assert.equal(error.path, 'bad.yaml');
    assert.ok(error.line >= 2);
    assert.ok(error.column >= 1);
    return true;
  });
});

for (const [name, input, metadata, body] of [
  [
    'plain Markdown',
    '# Company\n\n---\nText\n',
    {},
    '# Company\n\n---\nText\n',
  ],
  [
    'front matter',
    '---\nrole: engineer\nprocesses: [development]\n---\n# Contract\n\n---\nEnd\n',
    { role: 'engineer', processes: ['development'] },
    '# Contract\n\n---\nEnd\n',
  ],
  [
    'CRLF and BOM',
    '\uFEFF---  \r\nrole: engineer\r\n--- \r\n# Body\r\n',
    { role: 'engineer' },
    '# Body\r\n',
  ],
  ['empty front matter', '---\n---\nBody', {}, 'Body'],
  ['EOF delimiter', '---\nrole: engineer\n---', { role: 'engineer' }, ''],
  ['BOM plain body', '\uFEFF# Body\n', {}, '# Body\n'],
]) {
  test(`reads ${name} and preserves its body`, async (t) => {
    const root = await fixture(t, { 'ROLE.md': input });
    const company = await load({ directory: root });
    assert.deepEqual(await company.readMarkdown('ROLE.md'), { metadata, body });
  });
}

test('unterminated front matter fails rather than ignoring metadata', async (t) => {
  const root = await fixture(t, {
    'bad.md': '---\nrole: private-source-marker\n',
  });
  const company = await load({ directory: root });
  await assert.rejects(
    company.readMarkdown('bad.md'),
    failure('INVALID_FRONT_MATTER'),
  );
});

test('front matter diagnostics use document line numbers', async (t) => {
  const root = await fixture(t, {
    'bad.md': '---\nname: ok\nname: private-source-marker\n---\nBody',
  });
  const company = await load({ directory: root });
  await assert.rejects(company.readMarkdown('bad.md'), (error) => {
    failure('INVALID_YAML')(error);
    assert.equal(error.line, 3);
    return true;
  });
});

for (const path of ['../outside.yaml', '/etc/passwd', '', '.']) {
  test(`rejects invalid or escaping document path: ${JSON.stringify(path)}`, async (t) => {
    const root = await fixture(t);
    const company = await load({ directory: root });
    await assert.rejects(
      company.readYaml(path),
      failure(
        path === '.'
          ? 'NOT_REGULAR_FILE'
          : path === ''
            ? 'INVALID_PATH'
            : 'PATH_OUTSIDE_REPOSITORY',
      ),
    );
  });
}

test('rejects document and marker symlinks outside repository', async (t) => {
  const outside = await fixture(t);
  const root = await fixture(t);
  await symlink(join(outside, 'company.yaml'), join(root, 'escape.yaml'));
  const company = await load({ directory: root });
  await assert.rejects(
    company.readYaml('escape.yaml'),
    failure('PATH_OUTSIDE_REPOSITORY'),
  );
  await rm(join(root, 'company.yaml'));
  await symlink(join(outside, 'company.yaml'), join(root, 'company.yaml'));
  await assert.rejects(
    load({ directory: root }),
    failure('PATH_OUTSIDE_REPOSITORY'),
  );
});

test('supports an explicitly selected symlink root and contained symlinks', async (t) => {
  const root = await fixture(t, { 'real.yaml': 'role: engineer\n' });
  const holder = await fixture(t);
  await symlink(root, join(holder, 'company'));
  await symlink('real.yaml', join(root, 'alias.yaml'));
  const company = await load({ directory: join(holder, 'company') });
  assert.equal(company.root, root);
  assert.deepEqual(await company.readYaml('alias.yaml'), { role: 'engineer' });
});

test('missing, oversized, and nonregular files fail with structured errors', async (t) => {
  const root = await fixture(t, { 'huge.md': 'x'.repeat(1024 * 1024 + 1) });
  const company = await load({ directory: root });
  await assert.rejects(
    company.readYaml('missing.yaml'),
    failure('FILE_NOT_FOUND'),
  );
  await assert.rejects(
    company.readMarkdown('huge.md'),
    failure('FILE_TOO_LARGE'),
  );
  await mkdir(join(root, 'directory.yaml'));
  await assert.rejects(
    company.readYaml('directory.yaml'),
    failure('NOT_REGULAR_FILE'),
  );
});

test('empty and comment-only YAML are valid empty metadata', async (t) => {
  const root = await fixture(t, {
    'empty.yaml': '',
    'comment.yaml': '# Note\n',
  });
  const company = await load({ directory: root });
  assert.deepEqual(await company.readYaml('empty.yaml'), {});
  assert.deepEqual(await company.readYaml('comment.yaml'), {});
});

test('reading a company never writes or rewrites its files', async (t) => {
  const root = await fixture(t, { 'COMPANY.md': '# Original\n' });
  const before = await readdir(root);
  const company = await load({ directory: root });
  await company.readMarkdown('COMPANY.md');
  assert.deepEqual(await readdir(root), before);
  assert.equal(await readFile(join(root, 'company.yaml'), 'utf8'), config);
  assert.equal(
    await readFile(join(root, 'COMPANY.md'), 'utf8'),
    '# Original\n',
  );
});

test('the shipped generic company starter loads through the public Core API', async () => {
  const company = await load({
    directory: new URL('../templates/company/', import.meta.url).pathname,
  });
  assert.deepEqual(company.config, {
    schemaVersion: 1,
    id: 'example-company',
    name: 'Example Company',
  });
  assert.deepEqual(
    await company.readYaml('projects/example-project/project.yaml'),
    {
      project: 'example-project',
      activation: 'pending-owner-approval',
    },
  );
  assert.match(
    (await company.readMarkdown('COMPANY.md')).body,
    /company purpose/,
  );
});

test('rejects newline-suffixed company IDs as invalid slugs', async (t) => {
  const root = await fixture(t, {
    'company.yaml': 'schemaVersion: 1\nid: "sample\\n"\nname: Sample\n',
  });
  await assert.rejects(
    load({ directory: root }),
    failure('INVALID_CONFIG', 'id'),
  );
});

test('accepts maximum-length IDs and 200 Unicode characters in display names', async (t) => {
  const root = await fixture(t, {
    'company.yaml': `schemaVersion: 1\nid: ${'a'.repeat(64)}\nname: ${'🌱'.repeat(200)}\n`,
  });
  assert.equal((await load({ directory: root })).config.name, '🌱'.repeat(200));
});

test('accepts a 1 MiB document exactly and rejects invalid UTF-8', async (t) => {
  const root = await fixture(t, {
    'limit.md': 'x'.repeat(1024 * 1024),
    'bad.md': Buffer.from([0xff, 0xfe]),
  });
  const company = await load({ directory: root });
  assert.equal(
    (await company.readMarkdown('limit.md')).body.length,
    1024 * 1024,
  );
  await assert.rejects(
    company.readMarkdown('bad.md'),
    failure('FILE_READ_ERROR'),
  );
});

test('broken nearest marker symlinks never fall back', async (t) => {
  const root = await fixture(t, { 'nested/file.md': '# Nested' });
  await symlink('absent.yaml', join(root, 'nested/company.yaml'));
  await assert.rejects(
    load({ cwd: join(root, 'nested') }),
    failure('CONFIG_NOT_FOUND'),
  );
});

test('default environment reads MZ_COMPANY_DIR without requiring caller options', async (t) => {
  const root = await fixture(t);
  const previous = process.env.MZ_COMPANY_DIR;
  process.env.MZ_COMPANY_DIR = root;
  try {
    assert.equal((await core.loadCompanyRepository()).root, root);
  } finally {
    if (previous === undefined) delete process.env.MZ_COMPANY_DIR;
    else process.env.MZ_COMPANY_DIR = previous;
  }
});

for (const separator of ['\r', '\u2028', '\u2029']) {
  test(`front matter delimiters cannot use ${JSON.stringify(separator)} as a line boundary`, async (t) => {
    const root = await fixture(t, {
      'before.md': `---\nx: hello${separator}---\nBODY`,
      'after.md': `---\nx: value\n---${separator}BODY`,
    });
    const company = await load({ directory: root });
    for (const name of ['before.md', 'after.md']) {
      await assert.rejects(
        company.readMarkdown(name),
        failure('INVALID_FRONT_MATTER'),
      );
    }
  });
}

test('normalizes exactly one leading Markdown BOM and accepts BOM-prefixed YAML', async (t) => {
  const root = await fixture(t, {
    'body.md': '\uFEFF\uFEFF# Body\n',
    'bom.yaml': '\uFEFFrole: engineer\n',
  });
  const company = await load({ directory: root });
  assert.equal((await company.readMarkdown('body.md')).body, '\uFEFF# Body\n');
  assert.deepEqual(await company.readYaml('bom.yaml'), { role: 'engineer' });
});
