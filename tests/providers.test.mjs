import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';
import * as github from '../packages/providers/github/dist/index.js';

const actionId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const runId = '33333333-3333-4333-8333-333333333333';
const context = { actionId, actorId, runId };
const repository = {
  provider: 'github',
  kind: 'repository',
  externalId: 'example/project',
};
const item = {
  provider: 'github',
  kind: 'work-item',
  externalId: 'example/project#142',
};
function rejects(code) {
  return (error) => {
    assert.ok(error instanceof core.ProviderError);
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(
      JSON.stringify(error) + error.stack,
      /synthetic-provider-secret/,
    );
    return true;
  };
}
function fixture(append) {
  const records = [];
  const provider = github.createGitHubProviderSkeleton({
    audit: {
      async append(record) {
        records.push(record);
        if (append) await append(record);
      },
    },
  });
  return { provider, records };
}

for (const [operation, target, call] of [
  ['repository.read', repository, (p, ref) => p.getRepository(ref, context)],
  ['work-item.read', item, (p, ref) => p.getWorkItem(ref, context)],
  [
    'work-item.create',
    repository,
    (p, ref) =>
      p.createWorkItem(
        {
          repository: ref,
          title: 'synthetic-provider-secret',
          body: 'synthetic-provider-secret',
        },
        context,
      ),
  ],
]) {
  test(`${operation} is explicitly unavailable and audits only structural data`, async () => {
    const { provider, records } = fixture();
    await assert.rejects(
      call(provider, {
        ...target,
        url: 'https://example.invalid/synthetic-provider-secret',
      }),
      rejects('NOT_IMPLEMENTED'),
    );
    assert.equal(provider.provider, 'github');
    assert.equal(records.length, 2);
    for (const [index, record] of records.entries()) {
      assert.deepEqual(
        {
          ...record,
          occurredAt: undefined,
          phase: undefined,
          errorCode: undefined,
        },
        {
          actionId,
          actorId,
          runId,
          provider: 'github',
          operation,
          target,
          occurredAt: undefined,
          phase: undefined,
          errorCode: undefined,
        },
      );
      assert.equal(
        new Date(record.occurredAt).toISOString(),
        record.occurredAt,
      );
      assert.equal(record.phase, index === 0 ? 'started' : 'failed');
      assert.equal(
        record.errorCode,
        index === 0 ? undefined : 'NOT_IMPLEMENTED',
      );
      assert.ok(Object.isFrozen(record));
      assert.ok(Object.isFrozen(record.target));
    }
    assert.doesNotMatch(
      JSON.stringify(records),
      /synthetic-provider-secret|url|title|body/,
    );
  });
}

for (const bad of [
  { ...repository, provider: 'gitlab' },
  { ...repository, kind: 'work-item' },
  { ...repository, externalId: '../project' },
  { ...repository, externalId: 'example/project/extra' },
  { ...repository, token: 'synthetic-provider-secret' },
  { ...repository, externalId: '' },
]) {
  test(`invalid repository reference rejected before audit: ${JSON.stringify(bad)}`, async () => {
    const { provider, records } = fixture();
    await assert.rejects(
      provider.getRepository(bad, context),
      rejects('INVALID_INPUT'),
    );
    assert.deepEqual(records, []);
  });
}

test('unscoped issue numbers and malformed action identities fail before auditing', async () => {
  const { provider, records } = fixture();
  for (const externalId of [
    '142',
    'example/project#0',
    'example/project#01',
    'example/project#-1',
    'example/..#1',
    'example/.#1',
  ]) {
    await assert.rejects(
      provider.getWorkItem({ ...item, externalId }, context),
      rejects('INVALID_INPUT'),
    );
  }
  for (const bad of [
    { ...context, actionId: 'bad' },
    { ...context, actorId: undefined },
    { ...context, runId: 'bad' },
    { ...context, secret: 'synthetic-provider-secret' },
  ]) {
    await assert.rejects(
      provider.getRepository(repository, bad),
      rejects('INVALID_INPUT'),
    );
  }
  assert.deepEqual(records, []);
});

test('input and audit method accessors are never evaluated', async () => {
  let reads = 0;
  const { provider, records } = fixture();
  const bad = {
    ...repository,
    get externalId() {
      reads++;
      throw new Error('synthetic-provider-secret');
    },
  };
  await assert.rejects(
    provider.getRepository(bad, context),
    rejects('INVALID_INPUT'),
  );
  assert.throws(
    () =>
      github.createGitHubProviderSkeleton({
        audit: {
          get append() {
            reads++;
            throw new Error('synthetic-provider-secret');
          },
        },
      }),
    rejects('INVALID_INPUT'),
  );
  assert.equal(reads, 0);
  assert.deepEqual(records, []);
});

for (const failPhase of ['started', 'failed']) {
  test(`audit failure at ${failPhase} is fail-closed and sanitized`, async () => {
    const { provider, records } = fixture(async (record) => {
      if (record.phase === failPhase)
        throw new Proxy(
          {},
          {
            get() {
              throw new Error('synthetic-provider-secret');
            },
          },
        );
    });
    await assert.rejects(
      provider.getRepository(repository, context),
      rejects('AUDIT_FAILED'),
    );
    assert.equal(records.length, failPhase === 'started' ? 1 : 2);
  });
}

test('start acknowledgement must settle before terminal auditing', async () => {
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const { provider, records } = fixture(async (record) => {
    if (record.phase === 'started') await barrier;
  });
  const outcome = assert.rejects(
    provider.getRepository(repository, context),
    rejects('NOT_IMPLEMENTED'),
  );
  await Promise.resolve();
  assert.equal(records.length, 1);
  release();
  await outcome;
  assert.equal(records.length, 2);
});

test('create inputs require bounded title/body and reject extra content fields before auditing', async () => {
  const { provider, records } = fixture();
  for (const bad of [
    { repository, title: '', body: '' },
    { repository, title: 'x'.repeat(257), body: '' },
    { repository, title: 'title', body: 'x'.repeat(65537) },
    {
      repository,
      title: 'title',
      body: '',
      token: 'synthetic-provider-secret',
    },
  ]) {
    await assert.rejects(
      provider.createWorkItem(bad, context),
      rejects('INVALID_INPUT'),
    );
  }
  assert.deepEqual(records, []);
});

test('provider errors sanitize unknown public constructor codes', () => {
  const error = new core.ProviderError('synthetic-provider-secret');
  assert.equal(error.code, 'INVALID_INPUT');
  assert.doesNotMatch(
    JSON.stringify(error) + error.stack,
    /synthetic-provider-secret/,
  );
});
