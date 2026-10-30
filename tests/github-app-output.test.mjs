import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGitHubPermissions } from '../packages/cli/dist/github-app-output.js';

test('ready permissions show the next checkout action without asking for more grants', () => {
  const text = formatGitHubPermissions('example-org', {
    deliveryReady: true,
    missing: [],
    registrationMissing: [],
  });
  assert.match(text, /delivery access is ready for example-org/);
  assert.match(text, /mz project checkout NAME DIRECTORY --delivery/);
  assert.doesNotMatch(text, /Approve|Add these|desiredAppPermissions|^\{/);
});
test('installed grants pending approval do not ask the owner to edit the registration again', () => {
  const text = formatGitHubPermissions('example-org', {
    deliveryReady: false,
    missing: ['actions_variables', 'checks'],
    registrationMissing: [],
  });
  assert.match(text, /registration has the required permissions/);
  assert.match(text, /Variables: Read and write/);
  assert.match(text, /Checks: Read and write/);
  assert.match(text, /settings\/installations/);
  assert.doesNotMatch(
    text,
    /Add these App registration permissions|actions_variables|desiredAppPermissions/,
  );
});
