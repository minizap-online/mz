import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  stat,
  writeFile,
  symlink,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';
const id = '11111111-1111-4111-8111-111111111111';
test('private steward artifacts persist durably outside Git and reject link/permission aliases', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mz-artifacts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await core.openStewardArtifacts({ directory: root });
  await store.create(id, {
    schemaVersion: 1,
    scope: 'company',
    question: 'Review this idea.',
    context: 'Bounded context.',
    status: 'Unavailable.',
    history: [],
  });
  assert.equal((await stat(join(root, id))).mode & 0o777, 0o700);
  assert.equal(
    (await stat(join(root, id, 'request.json'))).mode & 0o777,
    0o600,
  );
  await store.complete(id, {
    answer: 'Answer',
    summary: 'Summary',
    decisions: [],
    triage: [],
    work: [],
    knowledgeUpdates: [],
    handover: {
      completed: [],
      changed: [],
      decisions: [],
      followups: [],
      risks: [],
      references: [],
    },
  });
  assert.equal((await store.readResponse(id)).summary, 'Summary');
  await assert.rejects(store.complete(id, {}));
  await assert.rejects(store.readResponse('../escape'));
  await rm(join(root, id, 'response.json'));
  await writeFile(join(root, 'elsewhere'), '{}', { mode: 0o600 });
  await symlink(join(root, 'elsewhere'), join(root, id, 'response.json'));
  await assert.rejects(store.readResponse(id));
  assert.match(
    await readFile(join(root, id, 'request.json'), 'utf8'),
    /Review this idea/,
  );
  const git = join(root, 'git');
  await mkdir(git, { mode: 0o700 });
  await mkdir(join(git, '.git'));
  await assert.rejects(core.openStewardArtifacts({ directory: git }));
});
