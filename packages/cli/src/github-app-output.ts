const labels: Readonly<Record<string, string>> = {
  metadata: 'Repository metadata',
  contents: 'Repository contents',
  issues: 'Issues',
  pull_requests: 'Pull requests',
  actions: 'GitHub Actions',
  workflows: 'Workflow files',
  administration: 'Repository administration',
  environments: 'Deployment environments',
  deployments: 'Deployments',
  pages: 'GitHub Pages',
  secrets: 'Secrets',
  actions_variables: 'Variables',
  checks: 'Checks',
  statuses: 'Commit statuses',
};

export function formatGitHubPermissions(
  organization: string,
  access: {
    deliveryReady: boolean;
    missing: readonly string[];
    registrationMissing: readonly string[];
  },
): string {
  if (access.deliveryReady)
    return (
      'GitHub delivery access is ready for ' +
      organization +
      '.\n\n' +
      'No permission changes are needed.\n' +
      'Next: mz project checkout NAME DIRECTORY --delivery\n'
    );
  const lines = [
    'GitHub delivery access is not ready for ' + organization + '.',
    '',
  ];
  if (access.registrationMissing.length) {
    lines.push('Add these App registration permissions:');
    for (const permission of access.registrationMissing)
      lines.push(
        '  - ' + (labels[permission] ?? permission) + ': Read and write',
      );
    lines.push(
      '',
      'Open the existing MZ App > Permissions & events, make these changes, then save.',
      'https://github.com/organizations/' + organization + '/settings/apps',
      '',
    );
  } else lines.push('The App registration has the required permissions.', '');
  if (access.missing.length) {
    lines.push('Approve these installation permissions:');
    for (const permission of access.missing)
      lines.push(
        '  - ' + (labels[permission] ?? permission) + ': Read and write',
      );
    lines.push(
      '',
      'Open MZ > Configure or Review request, then accept the updated permissions.',
      'https://github.com/organizations/' +
        organization +
        '/settings/installations',
      '',
    );
  }
  lines.push(
    'Then run: mz github permissions',
    'Keep the existing App and key; no new login is needed.',
  );
  return lines.join('\n') + '\n';
}
