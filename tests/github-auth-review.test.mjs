import assert from 'node:assert/strict';
import { execFile as exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { initializeLocalInstallation } from '../packages/core/dist/index.js';
import { runInitCli } from '../packages/cli/dist/init.js';
import { companyGitHubEnvironment } from '../packages/cli/dist/github-auth.js';
const execute = promisify(exec),
  cli = resolve('packages/cli/dist/main.js');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mz-gh-review-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configFile = join(root, 'config/mz/config.json');
  const companyDirectory = join(root, 'company');
  const settings = await initializeLocalInstallation({
    configFile,
    companyDirectory,
    stateDirectory: join(root, 'state'),
    id: 'sample',
    name: 'Sample',
  });
  await execute('git', ['init', '-q', companyDirectory]);
  await execute('git', [
    '-C',
    companyDirectory,
    'remote',
    'add',
    'origin',
    'https://github.com/example/company.git',
  ]);
  const bin = join(root, 'bin');
  await mkdir(bin);
  await writeFile(
    join(bin, 'codex'),
    `#!${process.execPath}\nprocess.exit(0);`,
    { mode: 0o700 },
  );
  return {
    root,
    settings,
    companyDirectory,
    env: { PATH: bin + ':' + process.env.PATH, MZ_CONFIG_FILE: configFile },
  };
}
test('existing init asks for authentication method before a hidden field even without an injected question handler', async (t) => {
  const f = await fixture(t);
  const questions = [];
  let secret = false;
  const result = await runInitCli(
    ['--repository', 'https://github.com/example/company.git'],
    {
      env: f.env,
      terminal: true,
      notice: () => {},
      createTerminal: () => ({
        question: async (label) => {
          questions.push(label);
          return 'existing';
        },
        close() {},
      }),
      readSecret: async () => {
        secret = true;
        throw new Error();
      },
    },
  );
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(secret, false);
  assert.ok(questions.some((q) => /authentication method/i.test(q)));
});
test('partial profile markers and malformed Git config cannot restore ambient credentials', async (t) => {
  const f = await fixture(t);
  await execute('git', [
    '-C',
    f.companyDirectory,
    'config',
    '--local',
    'mz.github.version',
    '1',
  ]);
  await assert.rejects(
    companyGitHubEnvironment(f.companyDirectory, {
      ...f.env,
      GH_TOKEN: 'synthetic_ambient_value',
    }),
  );
  await writeFile(join(f.companyDirectory, '.git/config'), '[invalid config');
  await assert.rejects(
    companyGitHubEnvironment(f.companyDirectory, {
      ...f.env,
      GH_TOKEN: 'synthetic_ambient_value',
    }),
  );
});
test('doctor retains structured diagnostics and does not authenticate with ambient access when company is missing', async (t) => {
  const f = await fixture(t);
  const capture = join(f.root, 'unexpected-api');
  await writeFile(
    join(f.root, 'bin/gh'),
    `#!${process.execPath}\nimport fs from 'node:fs';if(process.argv.includes('api'))fs.writeFileSync(${JSON.stringify(capture)},'called');process.exit(0);`,
    { mode: 0o700 },
  );
  let result;
  try {
    result = await execute(
      process.execPath,
      [
        cli,
        'doctor',
        '--company',
        join(f.root, 'missing'),
        '--github-auth',
        '--json',
      ],
      { env: { ...f.env, GH_TOKEN: 'synthetic_ambient_value' } },
    );
  } catch (error) {
    result = error;
  }
  assert.equal(result.code ?? 0, 1);
  const report = JSON.parse(result.stdout);
  assert.ok(
    report.checks.some((c) => c.id === 'company' && c.status === 'fail'),
  );
  assert.ok(
    report.checks.some((c) => c.id === 'github.auth' && c.status !== 'pass'),
  );
  await assert.rejects(readFile(capture));
});
test('an existing accessible empty repository passes connection verification without requiring HEAD', async (t) => {
  const f = await fixture(t);
  const { existsSync } = await import('node:fs');
  const { delimiter } = await import('node:path');
  const realGit = process.env.PATH.split(delimiter)
    .map((dir) => join(dir, 'git'))
    .find(existsSync);
  const bare = join(f.root, 'empty.git');
  await execute(realGit, ['init', '--bare', '-q', bare]);
  const secrets = join(f.root, 'secrets');
  await mkdir(secrets, { mode: 0o700 });
  const file = join(secrets, 'token');
  await writeFile(file, 'github_pat_synthetic_empty_repo', { mode: 0o600 });
  await writeFile(
    join(f.root, 'bin/gh'),
    `#!${process.execPath}\nimport fs from 'node:fs';import path from 'node:path';const args=process.argv.slice(2);if(args.includes('--with-token')){for await(const c of process.stdin){}fs.writeFileSync(path.join(process.env.GH_CONFIG_DIR,'hosts.yml'),'{}',{mode:384});process.exit(0);}if(args[0]==='api'){console.log('sample-member');process.exit(0);}process.exit(9);`,
    { mode: 0o700 },
  );
  await writeFile(
    join(f.root, 'bin/git'),
    `#!${process.execPath}\nimport {spawnSync} from 'node:child_process';const args=process.argv.slice(2);if(args[0]==='ls-remote'){const i=args.indexOf('https://github.com/example/company.git');if(i>=0)args[i]=${JSON.stringify(bare)};}process.exit(spawnSync(${JSON.stringify(realGit)},args,{stdio:'inherit'}).status??1);`,
    { mode: 0o700 },
  );
  const result = await runInitCli(
    [
      '--repository',
      'https://github.com/example/company.git',
      '--github-token-file',
      file,
      '--yes',
    ],
    { env: f.env, notice: () => {} },
  );
  assert.equal(result.exitCode, 0, result.stderr);
});
