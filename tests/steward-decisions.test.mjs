import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';
const actorId = '11111111-1111-4111-8111-111111111111',
  workerId = '22222222-2222-4222-8222-222222222222',
  sourceId = '33333333-3333-4333-8333-333333333333',
  approvalId = '44444444-4444-4444-8444-444444444444';
const response = {
  answer: 'Advice.',
  summary: 'Summary.',
  decisions: ['Choose a narrow pilot.'],
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
};
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mz-decisions-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = core.openRuntimeState({ path: join(root, 'state.sqlite3') });
  t.after(() => state.close());
  const artifactRoot = join(root, 'interactions'),
    knowledgeRoot = join(root, 'knowledge');
  await mkdir(artifactRoot, { mode: 0o700 });
  await mkdir(knowledgeRoot, { mode: 0o700 });
  const artifacts = await core.openStewardArtifacts({
    directory: artifactRoot,
  });
  await artifacts.create(sourceId, {
    schemaVersion: 1,
    scope: 'project:alpha',
    question: 'What next?',
    context: 'Context.',
    status: 'Unavailable.',
    history: [],
  });
  const interaction = state.startStewardInteraction({
    sourceId,
    actorId,
    workerId,
    scope: 'project:alpha',
  });
  await artifacts.complete(sourceId, response);
  state.finishStewardInteraction({
    id: interaction.id,
    actorId,
    outcome: 'succeeded',
  });
  const writer = await core.createPrivateStewardDecisionWriter({
    directory: knowledgeRoot,
  });
  return {
    root,
    state,
    artifacts,
    interaction,
    writer,
    knowledgeRoot,
    options: {
      state,
      artifacts,
      interactionId: interaction.id,
      proposalIndex: 0,
      writer,
    },
  };
}
test('approved decision writes private knowledge before recording linked structural audit', async (t) => {
  const f = await fixture(t);
  let approved;
  const result = await core.recordApprovedStewardDecision({
    ...f.options,
    approve: async (proposal) => {
      approved = proposal;
      return { approved: true, approvalId, actorId };
    },
  });
  assert.equal(approved.text, response.decisions[0]);
  assert.equal(approved.scope, 'project:alpha');
  assert.equal(result.approvalId, approvalId);
  const text = await readFile(
    join(f.knowledgeRoot, result.knowledgeId + '.md'),
    'utf8',
  );
  assert.match(text, /Choose a narrow pilot/);
  assert.match(text, new RegExp(f.interaction.id));
  const event = f.state.listEvents({ limit: 100 }).at(-1);
  assert.equal(event.type, 'decision.recorded');
  assert.equal(event.id, result.eventId);
  assert.equal(event.runId, f.interaction.runId);
  assert.doesNotMatch(
    (await readFile(join(f.root, 'state.sqlite3'))).toString(),
    /Choose a narrow pilot/,
  );
});
test('no approval or failed writer creates no decision event or successful reference', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    core.recordApprovedStewardDecision({
      ...f.options,
      approve: async () => ({ approved: false }),
    }),
  );
  assert.deepEqual(await readdir(f.knowledgeRoot), []);
  await assert.rejects(
    core.recordApprovedStewardDecision({
      ...f.options,
      approve: async () => ({ approved: true, approvalId, actorId }),
      writer: {
        async write() {
          throw new Error('synthetic-private-writer-error');
        },
      },
    }),
    (e) => {
      assert.doesNotMatch(e.stack, /synthetic-private-writer-error/);
      return true;
    },
  );
  assert.equal(f.state.listEvents({ limit: 100 }).length, 2);
  assert.equal(f.state.listStewardDecisions({ limit: 100 }).length, 0);
  await assert.rejects(
    core.recordApprovedStewardDecision({
      ...f.options,
      proposalIndex: 1,
      approve: async () => {
        throw new Error('must not approve absent proposal');
      },
    }),
  );
});
test('repeated decision recording stops before requesting approval or writing another knowledge file', async (t) => {
  const f = await fixture(t);
  await core.recordApprovedStewardDecision({
    ...f.options,
    approve: async () => ({ approved: true, approvalId, actorId }),
  });
  const before = await readdir(f.knowledgeRoot);
  let requests = 0;
  await assert.rejects(
    core.recordApprovedStewardDecision({
      ...f.options,
      approve: async () => {
        requests++;
        return {
          approved: true,
          approvalId: '55555555-5555-4555-8555-555555555555',
          actorId,
        };
      },
    }),
  );
  assert.equal(requests, 0);
  assert.deepEqual(await readdir(f.knowledgeRoot), before);
});
