import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as context from '../packages/context/dist/index.js';
import {
  openRuntimeState,
  openStewardArtifacts,
} from '../packages/core/dist/index.js';
import { contextFixture } from './helpers/context-fixture.mjs';
const actorId = '11111111-1111-4111-8111-111111111111',
  workerId = '22222222-2222-4222-8222-222222222222';
const response = {
  answer: 'Review the proposed pilot.',
  summary: 'A scoped pilot was discussed.',
  decisions: ['Choose one pilot after approval.'],
  triage: ['Classify input as idea.'],
  work: ['Draft pilot criteria.'],
  knowledgeUpdates: [],
  handover: {
    completed: ['Reviewed context.'],
    changed: [],
    decisions: [],
    followups: ['Owner supplies idea.'],
    risks: ['No live provider facts.'],
    references: [],
  },
};
async function fixture(t) {
  const f = await contextFixture(t);
  const directory = await mkdtemp(join(tmpdir(), 'mz-ask-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'runtime.sqlite3');
  const state = openRuntimeState({ path });
  t.after(() => state.close());
  const artifacts = join(directory, 'interactions');
  await mkdir(artifacts, { mode: 0o700 });
  return {
    ...f,
    path,
    state,
    artifacts,
    options: {
      ...f.options,
      state,
      runtimePath: path,
      artifactDirectory: artifacts,
      actorId,
      workerId,
      question: 'What should happen next?',
    },
  };
}
test('ask invokes bounded scoped advisory worker and persists only structural SQLite history', async (t) => {
  const f = await fixture(t);
  const requests = [];
  const worker = {
    async invoke(request) {
      requests.push(request);
      return response;
    },
  };
  const first = await context.askSteward({ ...f.options, worker });
  assert.equal(first.interaction.outcome, 'succeeded');
  assert.deepEqual(first.response, response);
  assert.equal(requests[0].scope, 'project:alpha');
  assert.deepEqual(requests[0].history, []);
  assert.doesNotMatch(
    JSON.stringify(requests),
    /UNRELATED_PROJECT|beta|mz-context-/,
  );
  const second = await context.askSteward({ ...f.options, worker });
  assert.equal(requests[1].history[0].interactionId, first.interaction.id);
  assert.equal(requests[1].history[0].summary, response.summary);
  assert.equal(second.response.handover.changed.length, 0);
  const store = await openStewardArtifacts({ directory: f.artifacts });
  assert.deepEqual(
    await store.readResponse(first.interaction.sourceId),
    response,
  );
  assert.doesNotMatch(
    (await readFile(f.path)).toString(),
    /What should happen|scoped pilot|Review the proposed/,
  );
  assert.equal(f.state.listEvents({ limit: 100 }).length, 4);
  assert.equal(f.state.listStewardDecisions({ limit: 100 }).length, 0);
  // Company history must not include project conversations.
  await context.askSteward({
    ...f.options,
    project: undefined,
    task: 'global',
    worker,
  });
  assert.deepEqual(requests[2].history, []);
  assert.doesNotMatch(requests[2].status, /alpha|Alpha/);
});
test('worker errors, invalid responses and timeout record failed outcomes with safe errors', async (t) => {
  const f = await fixture(t);
  for (const worker of [
    {
      async invoke() {
        throw new Error('synthetic-private-provider-error');
      },
    },
    {
      async invoke() {
        return { ...response, execute: 'do it' };
      },
    },
    {
      invoke(request, signal) {
        return new Promise((resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => reject(new Error('synthetic-private-provider-error')),
            { once: true },
          ),
        );
      },
    },
  ]) {
    await assert.rejects(
      context.askSteward({ ...f.options, worker, timeoutMs: 25 }),
      (e) => {
        assert.doesNotMatch(
          e.stack,
          /synthetic-private-provider-error|mz-ask-/,
        );
        return true;
      },
    );
  }
  assert.equal(f.state.listStewardInteractions({ limit: 100 }).length, 3);
  assert.ok(
    f.state
      .listStewardInteractions({ limit: 100 })
      .every((i) => i.outcome === 'failed'),
  );
});
test('unsafe question or identity fails before worker invocation and history is bounded', async (t) => {
  const f = await fixture(t);
  let calls = 0;
  const worker = {
    async invoke() {
      calls++;
      return response;
    },
  };
  for (const extra of [
    { question: 'password=synthetic-private' },
    { question: 'x'.repeat(8193) },
    { actorId: 'bad' },
    { timeoutMs: 0 },
  ])
    await assert.rejects(
      context.askSteward({ ...f.options, worker, ...extra }),
    );
  assert.equal(calls, 0);
  assert.equal(f.state.listStewardInteractions({ limit: 100 }).length, 0);
  for (let i = 0; i < 6; i++)
    await context.askSteward({ ...f.options, worker });
  let last;
  await context.askSteward({
    ...f.options,
    worker: {
      async invoke(r) {
        last = r;
        return response;
      },
    },
  });
  assert.equal(last.history.length, 4);
});
test('durable response plus failed outcome commit remains pending for explicit reconciliation', async (t) => {
  const f = await fixture(t);
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(f.path);
  t.after(() => db.close());
  await assert.rejects(
    context.askSteward({
      ...f.options,
      worker: {
        async invoke() {
          db.exec(
            "CREATE TRIGGER synthetic_finish_failure BEFORE UPDATE ON runs BEGIN SELECT RAISE(ABORT,'synthetic failure'); END",
          );
          return response;
        },
      },
    }),
  );
  const [pending] = f.state.listStewardInteractions({ limit: 100 });
  assert.equal(pending.outcome, null);
  const store = await openStewardArtifacts({ directory: f.artifacts });
  assert.deepEqual(await store.readResponse(pending.sourceId), response);
  assert.equal(f.state.listEvents({ limit: 100 }).length, 1);
});
