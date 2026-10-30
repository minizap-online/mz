import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  rm,
  mkdir,
  writeFile,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as core from '../packages/core/dist/index.js';
import { runOwnerConversation } from '../packages/cli/dist/conversation.js';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mz-provision-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const company = join(root, 'company');
  await mkdir(company, { mode: 0o700 });
  const calls = [];
  let exists = false;
  const repository = { id: 11, name: 'website', private: true, ownerId: 9 };
  return {
    root,
    company,
    calls,
    app: {
      connection: { organization: 'sample-org', organizationId: 9 },
      getRepository: async () => {
        calls.push('read');
        if (!exists) {
          const e = new Error();
          e.code = 'NOT_FOUND';
          throw e;
        }
        return repository;
      },
      createRepository: async () => {
        calls.push('create');
        exists = true;
        return repository;
      },
    },
    intent: {
      schemaVersion: 1,
      actionId: randomUUID(),
      actorId: randomUUID(),
      organizationId: 9,
      organization: 'sample-org',
      projectId: 'website',
      repositoryName: 'website',
      private: true,
      operation: 'create',
    },
  };
}
test('provisioning prepares project ask and replay repairs missing context without remote writes', async (t) => {
  const f = await fixture(t);
  const configFile = join(f.root, 'config/config.json');
  await core.initializeLocalInstallation({
    configFile,
    companyDirectory: f.company,
    stateDirectory: join(f.root, 'state'),
    id: 'sample',
    name: 'Sample',
  });
  const options = {
    directory: join(f.root, 'journal'),
    companyDirectory: f.company,
    intent: f.intent,
    approved: true,
    provider: f.app,
  };
  const ask = () =>
    runOwnerConversation('ask', ['--project', 'website', '--print'], {
      env: { MZ_CONFIG_FILE: configFile },
      terminal: false,
    });
  await core.provisionProject(options);
  const result = await ask();
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).request.scope, 'project:website');
  const project = join(f.company, 'projects/website');
  await writeFile(join(project, 'ARCHITECTURE.md'), '# Owner architecture\n');
  await rm(join(project, 'tasks'), { recursive: true });
  await rm(join(project, 'DECISIONS.md'));
  await core.provisionProject(options);
  assert.deepEqual(f.calls, ['read', 'create']);
  assert.equal(
    await readFile(join(project, 'ARCHITECTURE.md'), 'utf8'),
    '# Owner architecture\n',
  );
  assert.equal((await ask()).exitCode, 0);
});

test('provisioning rejects a task directory symlink', async (t) => {
  const f = await fixture(t);
  const outside = join(f.root, 'outside');
  await mkdir(outside);
  await mkdir(join(f.company, 'projects/website'), { recursive: true });
  await symlink(outside, join(f.company, 'projects/website/tasks'));
  await assert.rejects(() =>
    core.provisionProject({
      directory: join(f.root, 'journal'),
      companyDirectory: f.company,
      intent: f.intent,
      approved: true,
      provider: f.app,
    }),
  );
  await assert.rejects(readFile(join(outside, 'steward.md')), {
    code: 'ENOENT',
  });
});
test('provisioning requires explicit approval and durable Core intent before provider mutation', async (t) => {
  assert.equal(typeof core.provisionProject, 'function');
  const f = await fixture(t);
  await assert.rejects(() =>
    core.provisionProject({
      directory: join(f.root, 'journal'),
      companyDirectory: f.company,
      intent: f.intent,
      approved: false,
      provider: f.app,
    }),
  );
  assert.equal(f.calls.length, 0);
  const result = await core.provisionProject({
    directory: join(f.root, 'journal'),
    companyDirectory: f.company,
    intent: f.intent,
    approved: true,
    provider: f.app,
  });
  assert.equal(result.repositoryId, 11);
  assert.deepEqual(f.calls, ['read', 'create']);
  assert.match(
    await readFile(join(f.company, 'projects/website/REPOSITORY.md'), 'utf8'),
    /sample-org\/website/,
  );
  await core.provisionProject({
    directory: join(f.root, 'journal'),
    companyDirectory: f.company,
    intent: f.intent,
    approved: true,
    provider: f.app,
  });
  assert.deepEqual(f.calls, ['read', 'create']);
});
test('unknown remote outcome blocks duplicate POST and requires explicit attach reconciliation', async (t) => {
  const f = await fixture(t);
  const options = {
    directory: join(f.root, 'journal'),
    companyDirectory: f.company,
    intent: f.intent,
    approved: true,
    provider: {
      ...f.app,
      createRepository: async () => {
        f.calls.push('create');
        throw Error('network failure after remote success');
      },
    },
  };
  await assert.rejects(() => core.provisionProject(options));
  await assert.rejects(() => core.provisionProject(options));
  assert.equal(f.calls.filter((x) => x === 'create').length, 1);
});
test('foreign result and existing repository conflict cannot be adopted implicitly', async (t) => {
  const f = await fixture(t);
  const options = {
    directory: join(f.root, 'journal'),
    companyDirectory: f.company,
    intent: f.intent,
    approved: true,
    provider: {
      ...f.app,
      getRepository: async () => ({
        id: 77,
        name: 'website',
        private: true,
        ownerId: 9,
      }),
    },
  };
  await assert.rejects(() => core.provisionProject(options));
  assert.equal(f.calls.length, 0);
  const other = await fixture(t);
  await assert.rejects(() =>
    core.provisionProject({
      ...options,
      directory: join(other.root, 'journal'),
      companyDirectory: other.company,
      intent: other.intent,
      provider: {
        ...other.app,
        createRepository: async () => ({
          id: 11,
          name: 'website',
          private: true,
          ownerId: 999,
        }),
      },
    }),
  );
});
test('explicit attach preserves existing project knowledge and rejects journal paths in Git', async (t) => {
  const f = await fixture(t);
  const { writeFile } = await import('node:fs/promises');
  await mkdir(join(f.company, 'projects/website'), { recursive: true });
  await writeFile(
    join(f.company, 'projects/website/PROJECT.md'),
    'Owner context\n',
  );
  const options = {
    directory: join(f.root, 'journal'),
    companyDirectory: f.company,
    intent: { ...f.intent, operation: 'attach' },
    approved: true,
    provider: {
      ...f.app,
      getRepository: async () => ({
        id: 11,
        name: 'website',
        private: true,
        ownerId: 9,
      }),
    },
  };
  await core.provisionProject(options);
  assert.equal(
    await readFile(join(f.company, 'projects/website/PROJECT.md'), 'utf8'),
    'Owner context\n',
  );
  await mkdir(join(f.root, 'repo/.git'), { recursive: true });
  await assert.rejects(() =>
    core.provisionProject({
      ...options,
      directory: join(f.root, 'repo/journal'),
    }),
  );
});
