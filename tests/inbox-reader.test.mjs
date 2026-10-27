import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as core from '../packages/core/dist/index.js';
import {
  applyMigrations,
  migrations,
} from '../packages/state/dist/migrations.js';
const actorId = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'mz-inbox-read-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, path: join(root, 'state.sqlite3') };
}
test('read-only inbox views expose matching metadata/history without changing state', (t) => {
  const { path } = fixture(t);
  const state = core.openRuntimeState({ path });
  const item = state.createInboxItem({
    actorId,
    sourceId,
    intake: { sourceType: 'stdin', sourceBytes: 10 },
  });
  state.triageInboxItem({
    id: item.id,
    actorId,
    classification: 'idea',
    triaged: true,
  });
  const expected = state.getInboxDetails(item.id);
  const history = state.listInboxChanges({ inboxItemId: item.id });
  const events = state.listEvents();
  state.close();
  const before = readFileSync(path);
  assert.deepEqual(core.listInbox({ path }), [expected]);
  assert.deepEqual(core.inspectInboxItem({ path, id: item.id }), expected);
  assert.deepEqual(
    core.listInboxChanges({ path, inboxItemId: item.id }),
    history,
  );
  assert.equal(core.inspectInboxItem({ path, id: actorId }), null);
  assert.deepEqual(readFileSync(path), before);
  const reopened = core.openRuntimeState({ path });
  try {
    assert.deepEqual(reopened.listEvents(), events);
  } finally {
    reopened.close();
  }
});
for (const kind of ['missing', 'empty', 'v3'])
  test(`inbox reads reject ${kind} stores without initializing/upgrading`, (t) => {
    const { root, path } = fixture(t);
    if (kind !== 'missing') {
      const db = new DatabaseSync(path);
      if (kind === 'v3') applyMigrations(db, migrations.slice(0, 3));
      db.close();
    }
    const before = kind === 'missing' ? null : readFileSync(path);
    for (const action of [
      () => core.listInbox({ path }),
      () => core.inspectInboxItem({ path, id: actorId }),
      () => core.listInboxChanges({ path, inboxItemId: actorId }),
    ])
      assert.throws(action, (e) => e instanceof core.RuntimeStateError);
    if (before) assert.deepEqual(readFileSync(path), before);
    else assert.deepEqual(readdirSync(root), []);
  });
test('reader rejects invalid fields/cursors and does not expose rejected data', (t) => {
  const { path } = fixture(t);
  core.openRuntimeState({ path }).close();
  for (const input of [
    { path, limit: 1001 },
    { path, afterSequence: -1 },
    { path, body: 'synthetic-inbox-reader-private' },
  ])
    assert.throws(
      () => core.listInbox(input),
      (e) => {
        assert.ok(e instanceof core.RuntimeStateError);
        assert.doesNotMatch(
          JSON.stringify(e) + e.stack,
          /synthetic-inbox-reader-private/,
        );
        return true;
      },
    );
});
