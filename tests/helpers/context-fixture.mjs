import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadCompanyRepository } from '../../packages/core/dist/index.js';
export const contextFiles = {
  'company.yaml': 'schemaVersion: 1\nid: example\nname: Example\n',
  'COMPANY.md': 'Company essentials.\n',
  'AUTHORITY.md': 'Execution needs separately assigned capabilities.\n',
  'roles/developer.md':
    '---\nrole: developer\nprocesses: [development]\npolicies: [review]\ndecisions: [policy-001]\n---\nDeveloper contract.\n',
  'policies/security-baseline.md': 'Use symbolic secret references only.\n',
  'policies/review.md': 'Verify changes before integration.\n',
  'processes/development.md': 'Development workflow.\n',
  'processes/release.md': 'Release workflow.\n',
  'processes/intake.md': 'Private intake workflow.\n',
  'processes/unrelated.md': 'UNRELATED_PROCESS_PRIVATE\n',
  'decisions/policy-001.md': 'Company decision.\n',
  'decisions/project-rule.md': 'Selected project decision.\n',
  'tasks/global.md':
    '---\nrole: developer\nprocesses: [intake]\n---\nCompany task.\n',
  'projects/alpha/project.yaml':
    'project: alpha\nactivation: pending-owner-approval\nprocesses: [release]\ndecisions: [project-rule]\n',
  'projects/alpha/PROJECT.md': 'Alpha project brief.\n',
  'projects/alpha/ARCHITECTURE.md': 'Alpha architecture.\n',
  'projects/alpha/STATUS.md':
    'Curated status; provider work remains authoritative.\n',
  'projects/alpha/DECISIONS.md': 'Alpha decisions.\n',
  'projects/alpha/tasks/job.md':
    '---\nrole: developer\nproject: alpha\nprocesses: [development]\nwork:\n  provider: github\n  kind: work-item\n  externalId: example/alpha#142\n  url: https://example.invalid/alpha/142\n---\nSelected task.\n',
  'projects/beta/PROJECT.md': 'UNRELATED_PROJECT_PRIVATE\n',
  'projects/beta/project.yaml': 'malformed: [\n',
};
export async function contextFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mz-context-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(contextFiles)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  const company = await loadCompanyRepository({ directory: root, env: {} });
  return {
    root,
    company,
    options: { company, role: 'developer', project: 'alpha', task: 'job' },
  };
}
