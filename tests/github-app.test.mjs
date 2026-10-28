import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import * as github from '../packages/providers/github/dist/index.js';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const connection = {
  schemaVersion: 1,
  appId: 7,
  installationId: 8,
  organizationId: 9,
  organization: 'sample-org',
  ownerId: 10,
  owner: 'human',
};
const permissions = {
  metadata: 'read',
  contents: 'write',
  issues: 'write',
  pull_requests: 'write',
  repository_creation: 'write',
  organization_projects: 'write',
  members: 'read',
};
function fixture(overrides = {}) {
  const calls = [];
  const request = async (method, path, body, auth) => {
    calls.push({ method, path, body, auth });
    if (path === '/app')
      return {
        id: 7,
        slug: 'sample-app',
        owner: { id: 9, type: 'Organization' },
        permissions,
        ...overrides.app,
      };
    if (path === '/app/installations/8')
      return {
        app_id: 7,
        id: 8,
        account: { id: 9, login: 'sample-org', type: 'Organization' },
        repository_selection: 'all',
        suspended_at: null,
        permissions,
        ...overrides.installation,
      };
    if (path === '/app/installations/8/access_tokens')
      return {
        token: 'ghs_synthetic',
        expires_at: new Date(Date.now() + 3500000).toISOString(),
        permissions: { metadata: 'read', ...body.permissions },
        ...(body.repository_ids
          ? { repositories: body.repository_ids.map((id) => ({ id })) }
          : {}),
        ...overrides.token,
      };
    if (path === '/orgs/sample-org/memberships/human')
      return {
        state: 'active',
        role: 'admin',
        user: { id: 10 },
        ...overrides.owner,
      };
    if (path === '/repos/sample-org/website')
      return {
        id: 11,
        name: 'website',
        private: true,
        owner: { id: 9 },
        ...overrides.repository,
      };
    if (path === '/orgs/sample-org/repos')
      return {
        id: 11,
        name: body.name,
        private: body.private,
        owner: { id: 9 },
        ...overrides.repository,
      };
    throw new Error('unexpected route');
  };
  return {
    calls,
    make: () =>
      github.createGitHubApp({
        connection,
        privateKey: async () => Buffer.from(pem),
        request,
      }),
  };
}
test('GitHub App verifies owner and all-repository installation using signed JWT, never user OAuth', async () => {
  assert.equal(typeof github.createGitHubApp, 'function');
  const f = fixture();
  const app = f.make();
  await app.verify();
  const jwt = f.calls[0].auth.split('.');
  assert.equal(jwt.length, 3);
  assert.equal(
    verify(
      'RSA-SHA256',
      Buffer.from(jwt.slice(0, 2).join('.')),
      keys.publicKey,
      Buffer.from(jwt[2], 'base64url'),
    ),
    true,
  );
  assert.equal(JSON.parse(Buffer.from(jwt[1], 'base64url')).iss, 7);
  assert.ok(!f.calls.some((c) => c.path === '/user'));
});
for (const [label, overrides] of Object.entries({
  members: {
    installation: { permissions: { ...permissions, members: 'write' } },
  },
  admin: { app: { permissions: { ...permissions, administration: 'write' } } },
  unknown: { app: { permissions: { ...permissions, emails: 'read' } } },
  wrong_org: { installation: { account: { id: 100, type: 'Organization' } } },
  not_owner: { owner: { role: 'member' } },
  wrong_owner: { owner: { user: { id: 99 } } },
  suspended: { installation: { suspended_at: '2026-01-01' } },
  selected: { installation: { repository_selection: 'selected' } },
})) {
  test('rejects unsafe App binding: ' + label, async () => {
    const f = fixture(overrides);
    await assert.rejects(() => f.make().verify());
    assert.ok(!f.calls.some((c) => c.path === '/orgs/sample-org/repos'));
  });
}
test('repository token explicitly narrows permissions and IDs and is never a broad installation token', async () => {
  const f = fixture();
  const app = f.make();
  const result = await app.withRepositoryToken(
    'website',
    async (token) => token === 'ghs_synthetic',
  );
  assert.equal(result, true);
  const calls = f.calls.filter((c) => c.path.endsWith('/access_tokens'));
  const last = calls.at(-1);
  assert.deepEqual(last.body, {
    repository_ids: [11],
    permissions: {
      metadata: 'read',
      contents: 'write',
      issues: 'write',
      pull_requests: 'write',
    },
  });
  assert.ok(!last.body.permissions.members);
  assert.ok(!last.body.permissions.repository_creation);
});
for (const [label, token] of Object.entries({
  expired: { expires_at: '2020-01-01' },
  wide: { permissions: { ...permissions, members: 'write' } },
  foreign: { repositories: [{ id: 12 }] },
})) {
  test('rejects ' + label + ' scoped token before native use', async () => {
    const f = fixture({ token });
    let used = false;
    await assert.rejects(() =>
      f.make().withRepositoryToken('website', async () => {
        used = true;
      }),
    );
    assert.equal(used, false);
  });
}
test('repository creation has only creation permission and verifies returned ownership', async () => {
  const f = fixture();
  assert.equal((await f.make().createRepository('website', true)).id, 11);
  const create = f.calls.find((c) => c.path === '/orgs/sample-org/repos');
  assert.equal(create.body.private, true);
  const token = f.calls.filter((c) => c.path.endsWith('/access_tokens')).at(-1);
  assert.deepEqual(token.body, {
    permissions: { repository_creation: 'write' },
  });
  const bad = fixture({ repository: { owner: { id: 99 } } });
  await assert.rejects(() => bad.make().createRepository('website', true));
});
test('unsafe names and malformed connection IDs fail before any request', async () => {
  const f = fixture();
  await assert.rejects(() => f.make().createRepository('../wrong', true));
  assert.equal(f.calls.length, 0);
  assert.throws(() =>
    github.createGitHubApp({
      connection: { ...connection, ownerId: 0 },
      privateKey: async () => Buffer.from(pem),
    }),
  );
});
test('unauthenticated discovery and manifest exchange omit Authorization rather than sending an empty bearer', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const headers = [];
  globalThis.fetch = async (url, options) => {
    headers.push(options.headers);
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  await github.githubRequest('GET', '/orgs/sample-org', undefined, '');
  assert.equal(headers[0].Authorization, undefined);
});
