import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';
const actorId = '11111111-1111-4111-8111-111111111111';
const workerId = '22222222-2222-4222-8222-222222222222';
const sourceId = '33333333-3333-4333-8333-333333333333';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'mz-steward-snapshot-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, path: join(root, 'state.sqlite3') };
}
test('read-only steward snapshot filters scope before exposing counts/history', (t) => {
  const { path } = fixture(t);
  const state = core.openRuntimeState({ path });
  for (const scope of ['company', 'project:alpha', 'project:beta'])
    state.createInboxItem({
      sourceId,
      actorId,
      intake: { sourceType: 'stdin', sourceBytes: 10, scope },
    });
  const alpha = state.startStewardInteraction({
    sourceId,
    actorId,
    workerId,
    scope: 'project:alpha',
  });
  state.finishStewardInteraction({
    id: alpha.id,
    actorId,
    outcome: 'succeeded',
  });
  state.startStewardInteraction({
    sourceId: actorId,
    actorId,
    workerId,
    scope: 'project:beta',
  });
  state.close();
  const before = readFileSync(path);
  const a = core.readStewardSnapshot({ path, scope: 'project:alpha' });
  assert.equal(a.inbox.total, 1);
  assert.equal(a.runs.total, 1);
  assert.equal(a.runs.succeeded, 1);
  assert.equal(a.interactions.total, 1);
  assert.equal(a.recentInteractions.length, 1);
  assert.equal(a.recentInteractions[0].scope, 'project:alpha');
  assert.doesNotMatch(JSON.stringify(a), /project:beta/);
  const all = core.readStewardSnapshot({ path });
  assert.equal(all.inbox.total, 3);
  assert.equal(all.runs.total, 2);
  assert.equal(all.runs.pending, 1);
  assert.equal(all.backup.status, 'never');
  assert.deepEqual(readFileSync(path), before);
});
test('snapshot never initializes missing state and rejects invalid scope/limits', (t) => {
  const { root, path } = fixture(t);
  assert.throws(
    () => core.readStewardSnapshot({ path }),
    (e) => e instanceof core.RuntimeStateError,
  );
  assert.deepEqual(readdirSync(root), []);
  core.openRuntimeState({ path }).close();
  for (const extra of [
    { scope: 'unclassified' },
    { limit: 0 },
    { limit: 33 },
    { scope: 'project:../escape' },
    { body: 'synthetic-steward-private' },
  ])
    assert.throws(
      () => core.readStewardSnapshot({ path, ...extra }),
      (e) => {
        assert.ok(e instanceof core.RuntimeStateError);
        assert.doesNotMatch(
          JSON.stringify(e) + e.stack,
          /synthetic-steward-private/,
        );
        return true;
      },
    );
});
