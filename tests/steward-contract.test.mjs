import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';
export const response = {
  answer: 'Consider a small pilot.',
  summary: 'Pilot scope remains a proposal.',
  decisions: ['Use a narrow pilot after approval.'],
  triage: ['Classify the idea.'],
  work: ['Draft acceptance criteria.'],
  knowledgeUpdates: [],
  handover: {
    completed: ['Reviewed supplied evidence.'],
    changed: [],
    decisions: [],
    followups: ['Owner selects an idea.'],
    risks: ['No live provider state.'],
    references: [],
  },
};
test('worker response is bounded validated advice with a complete handover', () => {
  assert.deepEqual(core.validateStewardResponse(response), response);
  for (const bad of [
    { ...response, execute: 'rm -rf' },
    { ...response, summary: 'x'.repeat(2049) },
    { ...response, work: Array(17).fill('x') },
    { ...response, answer: 'password=synthetic-secret' },
    { ...response, answer: 'hidden\u001b[31m' },
    { ...response, handover: {} },
  ])
    assert.throws(() => core.validateStewardResponse(bad), /steward/i);
  let read = false;
  const evil = { ...response };
  Object.defineProperty(evil, 'answer', {
    get() {
      read = true;
      return 'secret';
    },
  });
  assert.throws(() => core.validateStewardResponse(evil));
  assert.equal(read, false);
});
