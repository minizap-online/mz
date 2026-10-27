import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';

const material = 'synthetic-secret-material-az123';
const reference = 'github-app:example';
async function fixture(t, content = material) {
  const directory = await mkdtemp(join(tmpdir(), 'mz-secret-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await chmod(directory, 0o700);
  await writeFile(join(directory, 'credential'), content, { mode: 0o600 });
  return directory;
}
async function provider(t, content) {
  const directory = await fixture(t, content);
  return {
    directory,
    provider: await core.createHostFileSecretProvider({
      directory,
      bindings: { [reference]: 'credential' },
    }),
  };
}
function rejected(code) {
  return (error) => {
    assert.ok(error instanceof core.SecretError);
    assert.equal(error.code, code);
    assert.doesNotMatch(
      JSON.stringify(error) + error.stack,
      /synthetic-secret-material-az123/,
    );
    assert.equal(error.cause, undefined);
    return true;
  };
}
async function resolved(t, content) {
  const { provider: source } = await provider(t, content);
  const handle = await source.resolve(core.parseSecretRef(reference));
  t.after(() => handle.dispose());
  return handle;
}

for (const ref of ['github-app:example', 'dns:project-zone', 'host:a_b.c-2']) {
  test(`symbolic reference is validated and serializable: ${ref}`, () => {
    assert.equal(core.parseSecretRef(ref), ref);
    assert.equal(JSON.stringify(core.parseSecretRef(ref)), JSON.stringify(ref));
  });
}
for (const ref of [
  '',
  'plain-value',
  'Upper:name',
  'host:../file',
  'host:path/file',
  'host:name\n',
  'host:',
  ':name',
  'a'.repeat(33) + ':name',
  'host:' + 'a'.repeat(129),
  null,
  42,
]) {
  test(`invalid reference is rejected without input echo: ${JSON.stringify(ref)}`, () => {
    assert.throws(
      () => core.parseSecretRef(ref),
      rejected('INVALID_SECRET_REF'),
    );
  });
}

test('only the allowlisted binding resolves and file text is preserved exactly', async (t) => {
  const text = '\uFEFFsynthetic-secret-material-az123\r\n';
  const { provider: source } = await provider(t, text);
  const handle = await source.resolve(core.parseSecretRef(reference));
  assert.equal(handle.ref, reference);
  assert.equal(await handle.use((value) => value.revealText() === text), true);
  await assert.rejects(
    source.resolve(core.parseSecretRef('dns:unknown')),
    rejected('UNKNOWN_SECRET_REF'),
  );
});

test('unknown references fail before checking inaccessible host storage', async (t) => {
  const { directory, provider: source } = await provider(t);
  await rm(directory, { recursive: true });
  await assert.rejects(
    source.resolve(core.parseSecretRef('host:unbound')),
    rejected('UNKNOWN_SECRET_REF'),
  );
});

test('resolved handles/scoped values reject serialization and redact inspection/coercion', async (t) => {
  const handle = await resolved(t);
  assert.throws(
    () => JSON.stringify({ nested: handle }),
    rejected('SECRET_SERIALIZATION_FORBIDDEN'),
  );
  assert.throws(() => structuredClone(handle));
  assert.equal(String(handle), '[REDACTED]');
  for (const options of [
    {},
    { showHidden: true, depth: null },
    { customInspect: false, showHidden: true },
  ]) {
    assert.doesNotMatch(
      inspect(handle, options),
      /synthetic-secret-material-az123/,
    );
  }
  await handle.use((value) => {
    assert.throws(
      () => JSON.stringify(value),
      rejected('SECRET_SERIALIZATION_FORBIDDEN'),
    );
    assert.throws(() => structuredClone(value));
    assert.equal(String(value), '[REDACTED]');
    assert.doesNotMatch(
      inspect(value, { showHidden: true, depth: null }),
      /synthetic-secret-material-az123/,
    );
    assert.equal(value.revealText(), material);
  });
});

test('scoped values expire after awaited action completion and handles are one-shot', async (t) => {
  const handle = await resolved(t);
  let escaped;
  assert.equal(
    await handle.use(async (value) => {
      escaped = value;
      await Promise.resolve();
      assert.equal(value.revealText(), material);
      return 17;
    }),
    17,
  );
  assert.throws(() => escaped.revealText(), rejected('SECRET_VALUE_EXPIRED'));
  await assert.rejects(
    handle.use(() => 1),
    rejected('SECRET_HANDLE_DISPOSED'),
  );
  assert.throws(
    () => JSON.stringify(handle),
    rejected('SECRET_SERIALIZATION_FORBIDDEN'),
  );
});

test('active use prevents concurrent reuse or dispose without destroying the active action', async (t) => {
  const handle = await resolved(t);
  let finish;
  const pending = handle.use(async (value) => {
    await new Promise((resolve) => {
      finish = resolve;
    });
    assert.equal(value.revealText(), material);
  });
  await assert.rejects(
    handle.use(() => 1),
    rejected('SECRET_HANDLE_ACTIVE'),
  );
  assert.throws(() => handle.dispose(), rejected('SECRET_HANDLE_ACTIVE'));
  finish();
  await pending;
});

test('manual disposal is idempotent and invalid actions do not expose material', async (t) => {
  const handle = await resolved(t);
  await assert.rejects(handle.use(null), rejected('INVALID_SECRET_ACTION'));
  handle.dispose();
  handle.dispose();
  await assert.rejects(
    handle.use(() => 1),
    rejected('SECRET_HANDLE_DISPOSED'),
  );
});

test('action errors are sanitized and always dispose the handle', async (t) => {
  const handle = await resolved(t);
  await assert.rejects(
    handle.use((value) => {
      throw new Error(value.revealText());
    }),
    rejected('SECRET_ACTION_FAILED'),
  );
  await assert.rejects(
    handle.use(() => 1),
    rejected('SECRET_HANDLE_DISPOSED'),
  );
});

test('redaction replaces nested wrappers, known raw/escaped/encoded values, and keys without mutating input', async (t) => {
  const handle = await resolved(t, 'synthetic-secret-material-az123\n"x"');
  await handle.use((value) => {
    const secret = value.revealText();
    const input = {
      handle,
      value,
      text: `Bearer ${secret}`,
      escaped: JSON.stringify(secret),
      encoded: encodeURIComponent(secret),
      [secret]: 'key',
      binary: Buffer.from(secret),
    };
    const safe = core.redactForLogging(input, [handle]);
    const text = JSON.stringify(safe);
    assert.doesNotMatch(text, /synthetic-secret-material-az123/);
    assert.equal(safe.handle, '[REDACTED]');
    assert.equal(safe.value, '[REDACTED]');
    assert.equal(input.text, `Bearer ${secret}`);
    assert.ok(text.includes('[REDACTED]'));
  });
  assert.throws(
    () => core.redactForLogging(material, [handle]),
    rejected('SECRET_HANDLE_DISPOSED'),
  );
});

test('redaction is cycle/accessor safe and does not run custom serializers', async (t) => {
  const handle = await resolved(t);
  let read = false;
  const input = {
    handle,
    toJSON() {
      throw new Error(material);
    },
  };
  Object.defineProperty(input, 'value', {
    enumerable: true,
    get() {
      read = true;
      throw new Error(material);
    },
  });
  input.circular = input;
  const safe = core.redactForLogging(input);
  assert.equal(read, false);
  assert.equal(safe.handle, '[REDACTED]');
  assert.equal(safe.circular, '[Circular]');
  assert.doesNotMatch(JSON.stringify(safe), /synthetic-secret-material-az123/);
  handle.dispose();
  assert.equal(core.redactForLogging(handle), '[REDACTED]');
  assert.throws(
    () => core.redactForLogging('text', [{}]),
    rejected('INVALID_SECRET_HANDLE'),
  );
});

for (const [name, change] of [
  [
    'public file permissions',
    async (dir) => chmod(join(dir, 'credential'), 0o644),
  ],
  ['executable secret', async (dir) => chmod(join(dir, 'credential'), 0o700)],
  [
    'file symlink',
    async (dir) => {
      await writeFile(join(dir, 'other'), material, { mode: 0o600 });
      await rm(join(dir, 'credential'));
      await symlink('other', join(dir, 'credential'));
    },
  ],
  [
    'file hardlink',
    async (dir) => link(join(dir, 'credential'), join(dir, 'other')),
  ],
  [
    'directory as credential',
    async (dir) => {
      await rm(join(dir, 'credential'));
      await mkdir(join(dir, 'credential'), { mode: 0o700 });
    },
  ],
  [
    'named pipe',
    async (dir) => {
      await rm(join(dir, 'credential'));
      execFileSync('mkfifo', ['-m', '600', join(dir, 'credential')]);
    },
  ],
]) {
  test(`rejects unsafe host file: ${name}`, async (t) => {
    const { directory, provider: source } = await provider(t);
    await change(directory);
    await assert.rejects(
      source.resolve(core.parseSecretRef(reference)),
      rejected('UNSAFE_SECRET_FILE'),
    );
  });
}

for (const [name, content] of [
  ['empty', ''],
  ['oversized', 'x'.repeat(65537)],
  ['invalid UTF8', Buffer.from([0xff, 0xfe])],
]) {
  test(`rejects ${name} credential data`, async (t) => {
    const { provider: source } = await provider(t, content);
    await assert.rejects(
      source.resolve(core.parseSecretRef(reference)),
      rejected('INVALID_SECRET_FILE'),
    );
  });
}

test('missing files fail with safe errors and permissions are checked again on resolve', async (t) => {
  const { directory, provider: source } = await provider(t);
  await rm(join(directory, 'credential'));
  await assert.rejects(
    source.resolve(core.parseSecretRef(reference)),
    rejected('SECRET_FILE_UNAVAILABLE'),
  );
  await chmod(directory, 0o755);
  await assert.rejects(
    source.resolve(core.parseSecretRef(reference)),
    rejected('UNSAFE_SECRET_DIRECTORY'),
  );
});

test('unsafe or symlink provider roots fail without reading file values', async (t) => {
  const directory = await fixture(t);
  await chmod(directory, 0o755);
  await assert.rejects(
    core.createHostFileSecretProvider({ directory, bindings: {} }),
    rejected('UNSAFE_SECRET_DIRECTORY'),
  );
  await chmod(directory, 0o700);
  const holder = await fixture(t);
  await symlink(directory, join(holder, 'link'));
  await assert.rejects(
    core.createHostFileSecretProvider({
      directory: join(holder, 'link'),
      bindings: {},
    }),
    rejected('UNSAFE_SECRET_DIRECTORY'),
  );
});

for (const binding of ['../credential', '/absolute', '.', '..', 'path/file']) {
  test(`invalid host binding is rejected: ${binding}`, async (t) => {
    const directory = await fixture(t);
    await assert.rejects(
      core.createHostFileSecretProvider({
        directory,
        bindings: { [reference]: binding },
      }),
      rejected('INVALID_SECRET_CONFIGURATION'),
    );
  });
}

test('host configuration accessors and unknown fields are rejected without evaluation', async (t) => {
  const directory = await fixture(t);
  let read = false;
  const bindings = {};
  Object.defineProperty(bindings, reference, {
    enumerable: true,
    get() {
      read = true;
      throw new Error(material);
    },
  });
  await assert.rejects(
    core.createHostFileSecretProvider({ directory, bindings }),
    rejected('INVALID_SECRET_CONFIGURATION'),
  );
  await assert.rejects(
    core.createHostFileSecretProvider({
      directory,
      bindings: {},
      token: material,
    }),
    rejected('INVALID_SECRET_CONFIGURATION'),
  );
  assert.equal(read, false);
});

test('resolved wrappers are rejected by Core state before any event is persisted', async (t) => {
  const directory = await fixture(t);
  const handle = await resolved(t);
  const state = core.openRuntimeState({
    path: join(directory, 'state.sqlite3'),
  });
  t.after(() => state.close());
  assert.throws(
    () => state.appendEvent({ type: 'decision.recorded', actorId: handle }),
    (error) => error.code === 'INVALID_INPUT',
  );
  assert.deepEqual(state.listEvents(), []);
});

test('a symlink root remains forbidden with trailing slash or dot spelling', async (t) => {
  const directory = await fixture(t);
  const holder = await fixture(t);
  const path = join(holder, 'link');
  await symlink(directory, path);
  for (const suffix of ['/', '/.']) {
    await assert.rejects(
      core.createHostFileSecretProvider({
        directory: path + suffix,
        bindings: {},
      }),
      rejected('UNSAFE_SECRET_DIRECTORY'),
    );
  }
});

test('hostile thrown error proxies cannot escape configuration or redaction error sanitization', async () => {
  const hostile = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw new Error(material);
      },
    },
  );
  const options = new Proxy(
    {},
    {
      ownKeys() {
        throw hostile;
      },
    },
  );
  await assert.rejects(
    core.createHostFileSecretProvider(options),
    rejected('INVALID_SECRET_CONFIGURATION'),
  );
  const input = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw hostile;
      },
    },
  );
  assert.throws(
    () => core.redactForLogging(input),
    rejected('INVALID_REDACTION_INPUT'),
  );
});

test('bindings are copied and file rotation is picked up by a newly resolved handle', async (t) => {
  const directory = await fixture(t);
  const bindings = { [reference]: 'credential' };
  const source = await core.createHostFileSecretProvider({
    directory,
    bindings,
  });
  bindings[reference] = '../outside';
  const first = await source.resolve(core.parseSecretRef(reference));
  await first.use((value) => assert.equal(value.revealText(), material));
  await writeFile(join(directory, 'credential'), 'synthetic-rotated-value');
  const rotated = await source.resolve(core.parseSecretRef(reference));
  await rotated.use((value) =>
    assert.equal(value.revealText(), 'synthetic-rotated-value'),
  );
});

test('a private directory under an unprotected writable ancestor is rejected', async (t) => {
  const parent = await fixture(t);
  const directory = join(parent, 'private');
  await mkdir(directory, { mode: 0o700 });
  await writeFile(join(directory, 'credential'), material, { mode: 0o600 });
  await chmod(parent, 0o777);
  await assert.rejects(
    core.createHostFileSecretProvider({
      directory,
      bindings: { [reference]: 'credential' },
    }),
    rejected('UNSAFE_SECRET_DIRECTORY'),
  );
});
