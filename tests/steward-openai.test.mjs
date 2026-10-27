import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as context from '../packages/context/dist/index.js';
import {
  createHostFileSecretProvider,
  parseSecretRef,
} from '../packages/core/dist/index.js';
const answer = {
  answer: 'Scoped answer.',
  summary: 'Summary.',
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
};
const request = {
  schemaVersion: 1,
  scope: 'company',
  question: 'What next?',
  context: 'Curated source.',
  status: 'Unavailable.',
  history: [],
};
async function configuration(t, transport) {
  const directory = await mkdtemp(join(tmpdir(), 'mz-steward-key-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'fixture'), 'synthetic-openai-key', {
    mode: 0o600,
  });
  const provider = await createHostFileSecretProvider({
    directory,
    bindings: { 'openai:steward': 'fixture' },
  });
  return {
    model: 'fixture-model',
    maxOutputTokens: 2048,
    resolveKey: () => provider.resolve(parseSecretRef('openai:steward')),
    transport,
  };
}
const envelope = (output) => ({
  status: 'completed',
  output: output ?? [
    {
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify(answer) }],
    },
  ],
});
test('real HTTP adapter constructs a stateless tool-free bounded request with scoped secret use', async (t) => {
  let body, url, options;
  const worker = context.createOpenAIWorker(
    await configuration(t, async (u, o) => {
      url = u;
      options = o;
      body = JSON.parse(o.body);
      return new Response(JSON.stringify(envelope()));
    }),
  );
  assert.deepEqual(
    await worker.invoke(request, new AbortController().signal),
    answer,
  );
  assert.equal(url, 'https://api.openai.com/v1/responses');
  assert.equal(options.redirect, 'error');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Bearer synthetic-openai-key');
  assert.equal(body.model, 'fixture-model');
  assert.equal(body.max_output_tokens, 2048);
  assert.equal(body.store, false);
  assert.deepEqual(body.tools, []);
  assert.equal(body.tool_choice, 'none');
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.equal(body.input[0].content, JSON.stringify(request));
  assert.doesNotMatch(JSON.stringify(body), /synthetic-openai-key/);
  assert.match(body.instructions, /advisory/i);
});
test('adapter rejects HTTP failures, refusals, incomplete output, tools, oversized data and malformed JSON without details', async (t) => {
  const cases = [
    new Response('synthetic-private-provider-error', { status: 429 }),
    new Response(JSON.stringify({ status: 'incomplete', output: [] })),
    new Response(
      JSON.stringify(envelope([{ type: 'function_call', name: 'execute' }])),
    ),
    new Response(
      JSON.stringify(
        envelope([
          {
            type: 'message',
            content: [
              { type: 'refusal', refusal: 'synthetic-private-provider-error' },
            ],
          },
        ]),
      ),
    ),
    new Response('x'.repeat(262145)),
    new Response('{synthetic-private-provider-error'),
  ];
  for (const value of cases) {
    const worker = context.createOpenAIWorker(
      await configuration(t, async () => value),
    );
    await assert.rejects(
      worker.invoke(request, new AbortController().signal),
      (e) => {
        assert.doesNotMatch(
          e.stack,
          /synthetic-private-provider-error|synthetic-openai-key|mz-steward-key/,
        );
        return true;
      },
    );
  }
  for (const extra of [
    { model: '' },
    { maxOutputTokens: 0 },
    { maxOutputTokens: 8193 },
  ])
    assert.throws(() =>
      context.createOpenAIWorker({
        model: 'fixture-model',
        maxOutputTokens: 1024,
        resolveKey: async () => {},
        ...extra,
      }),
    );
});
