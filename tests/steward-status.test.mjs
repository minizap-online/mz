import assert from 'node:assert/strict';
import { writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import * as context from '../packages/context/dist/index.js';
import { openRuntimeState } from '../packages/core/dist/index.js';
import { contextFixture } from './helpers/context-fixture.mjs';
test('status separates scoped curated evidence, runtime and unavailable provider truth', async (t) => {
  const f = await contextFixture(t);
  const path = join(f.root, 'runtime.sqlite3');
  openRuntimeState({ path }).close();
  const result = await context.getStewardStatus({
    company: f.company,
    project: 'alpha',
    runtimePath: path,
  });
  assert.equal(result.scope, 'project:alpha');
  assert.equal(result.curated.sources.length, 3);
  assert.match(JSON.stringify(result.curated), /pending-owner-approval/);
  assert.equal(result.runtime.availability, 'available');
  assert.equal(result.runtime.facts.inbox.total, 0);
  assert.equal(result.provider.availability, 'unavailable');
  assert.doesNotMatch(
    JSON.stringify(result),
    /UNRELATED_PROJECT|mz-context-|beta/,
  );
});
test('organization inventory is explicit and missing evidence is unavailable', async (t) => {
  const f = await contextFixture(t);
  const initial = await context.getStewardStatus({ company: f.company });
  assert.equal(initial.curated.inventory.availability, 'unavailable');
  assert.equal(initial.runtime.availability, 'unavailable');
  await writeFile(
    join(f.root, 'projects/index.yaml'),
    'schemaVersion: 1\nprojects: [alpha]\n',
  );
  const indexed = await context.getStewardStatus({ company: f.company });
  assert.equal(indexed.curated.inventory.availability, 'available');
  assert.deepEqual(indexed.curated.inventory.projects, ['alpha']);
  assert.match(JSON.stringify(indexed.curated.sources), /Alpha decisions/);
  // Company-only worker facts cannot inherit organization-wide inventory.
  const narrow = await context.getStewardStatus({
    company: f.company,
    companyOnly: true,
  });
  assert.doesNotMatch(JSON.stringify(narrow), /alpha|Alpha/);
});
test('status fails closed on unsafe/malformed or oversized existing sources', async (t) => {
  const f = await contextFixture(t);
  await writeFile(
    join(f.root, 'STATUS.md'),
    'password=synthetic-sensitive-value',
  );
  await assert.rejects(
    context.getStewardStatus({ company: f.company }),
    /credential|safely/i,
  );
  await rm(join(f.root, 'STATUS.md'));
  await symlink(
    join(f.root, 'projects/beta/PROJECT.md'),
    join(f.root, 'STATUS.md'),
  );
  await assert.rejects(context.getStewardStatus({ company: f.company }));
  await rm(join(f.root, 'STATUS.md'));
  await assert.rejects(
    context.getStewardStatus({ company: f.company, project: '../escape' }),
  );
  await writeFile(join(f.root, 'STATUS.md'), 'x'.repeat(70000));
  await assert.rejects(context.getStewardStatus({ company: f.company }));
});
