import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { runInitCli } from '../packages/cli/dist/init.js';
import { companyGitHubEnvironment } from '../packages/cli/dist/github-auth.js';
const realGit = process.env.PATH.split(delimiter)
  .map((dir) => join(dir, 'git'))
  .find(existsSync);
test('init selects a scoped token before cloning and reuses only a profile reference in company Git and steward environment', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mz-init-scoped-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  await mkdir(bin);
  const env = {
    PATH: bin + ':' + process.env.PATH,
    MZ_CONFIG_FILE: join(root, 'config/mz/config.json'),
    XDG_STATE_HOME: join(root, 'state'),
    XDG_DATA_HOME: join(root, 'data'),
    MZ_TEST_ROOT: root,
  };
  const prefix = `#!${process.execPath}\nimport fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';const root=process.env.MZ_TEST_ROOT;const args=process.argv.slice(2);\n`;
  await writeFile(join(bin, 'codex'), prefix + 'process.exit(0);', {
    mode: 0o700,
  });
  await writeFile(
    join(bin, 'gh'),
    prefix +
      `if(args[0]==='--version')process.exit(0);if(args[0]==='auth'&&args.includes('--with-token')){let chunks=[];for await(const c of process.stdin)chunks.push(c);fs.writeFileSync(path.join(root,'auth.json'),JSON.stringify({args,input:Buffer.concat(chunks).toString(),profile:process.env.GH_CONFIG_DIR}));process.exit(0);}if(args[0]==='api'){if(args.includes('--silent'))fs.writeFileSync(path.join(root,'doctor-profile.txt'),process.env.GH_CONFIG_DIR??'missing');console.log('sample-member');process.exit(0);}process.exit(9);`,
    { mode: 0o700 },
  );
  await writeFile(
    join(bin, 'git'),
    prefix +
      `if(args[0]==='clone'){if(!fs.existsSync(path.join(root,'auth.json')))process.exit(128);const target=args.at(-1);fs.mkdirSync(target,{recursive:true,mode:448});process.exit(spawnSync(${JSON.stringify(realGit)},['init','-q',target]).status);}if(args[0]==='ls-remote')process.exit(0);const result=spawnSync(${JSON.stringify(realGit)},args,{stdio:'inherit'});process.exit(result.status??1);`,
    { mode: 0o700 },
  );
  const notices = [];
  const prompts = [];
  const token = Buffer.from('github_pat_synthetic_scoped_init');
  const result = await runInitCli(
    ['--repository', 'https://github.com/example/company.git'],
    {
      env,
      terminal: true,
      notice: (text) => notices.push(text),
      question: async (label, fallback) => {
        prompts.push(label);
        return fallback;
      },
      readSecret: async () => {
        assert.match(notices.join('\n'), /Only select repositories/);
        return token;
      },
    },
  );
  assert.equal(result.exitCode, 0, result.stderr);
  const call = JSON.parse(await readFile(join(root, 'auth.json'), 'utf8'));
  assert.ok(call.args.includes('--with-token'));
  assert.ok(!call.args.includes('--web'));
  assert.equal(call.input, 'github_pat_synthetic_scoped_init');
  const company = join(root, 'data/mz/company');
  const config = await readFile(join(company, '.git/config'), 'utf8');
  assert.match(config, /mz|profile/);
  assert.doesNotMatch(config, /github_pat_/);
  const childEnv = await companyGitHubEnvironment(company, {
    ...env,
    GH_TOKEN: 'synthetic_unrelated_parent_value',
  });
  assert.equal(childEnv.GH_CONFIG_DIR, call.profile);
  assert.equal(childEnv.GH_TOKEN, undefined);
  assert.equal(env.GH_CONFIG_DIR, undefined);
  assert.doesNotMatch(
    notices.join('\n') + result.stdout + result.stderr,
    /github_pat_synthetic/,
  );
  assert.ok(prompts.some((label) => /authentication method/i.test(label)));
  assert.ok(token.every((byte) => byte === 0));
  const { execFile } = await import('node:child_process');
  await new Promise((resolve) =>
    execFile(
      process.execPath,
      ['packages/cli/dist/main.js', 'doctor', '--github-auth', '--json'],
      { env },
      () => resolve(),
    ),
  );
  assert.equal(
    await readFile(join(root, 'doctor-profile.txt'), 'utf8'),
    call.profile,
  );
  let unexpectedSecretRead = false;
  const conflict = await runInitCli(
    [
      '--repository',
      'https://github.com/other/company.git',
      '--company',
      join(root, 'other-company'),
    ],
    {
      env,
      terminal: true,
      notice: () => {},
      question: async (_label, fallback) => fallback,
      readSecret: async () => {
        unexpectedSecretRead = true;
        return Buffer.from('github_pat_synthetic_wrong_scope');
      },
    },
  );
  assert.equal(conflict.exitCode, 1);
  assert.equal(unexpectedSecretRead, false);
  assert.equal(
    JSON.parse(await readFile(join(root, 'auth.json'), 'utf8')).input,
    call.input,
  );
});
