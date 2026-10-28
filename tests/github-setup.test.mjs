import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as auth from '../packages/cli/dist/github-auth.js';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "mz-github-setup owner's path-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  await mkdir(bin);
  const capture = join(root, 'capture.json');
  await writeFile(
    join(bin, 'gh'),
    `#!${process.execPath}\nimport fs from 'node:fs';const args=process.argv.slice(2);if(args[0]==='auth'&&args.includes('--with-token')){let chunks=[];for await(const c of process.stdin)chunks.push(c);fs.writeFileSync(process.env.MZ_TEST_CAPTURE,JSON.stringify({args,input:Buffer.concat(chunks).toString(),profile:process.env.GH_CONFIG_DIR,tokenEnv:process.env.GH_TOKEN??null}));process.exit(0);}if(args[0]==='api'&&args.includes('user')){console.log('sample-member');process.exit(0);}process.exit(9);`,
    { mode: 0o700 },
  );
  return {
    root,
    env: {
      PATH: bin + ':' + process.env.PATH,
      MZ_CONFIG_FILE: join(root, 'config/mz/config.json'),
      MZ_TEST_CAPTURE: capture,
    },
    capture,
  };
}
test('token setup explains identity/scope before secret entry and delegates stdin to an isolated native profile', async (t) => {
  const f = await fixture(t);
  const messages = [];
  let secretRead = false;
  const token = Buffer.from('github_pat_synthetic_owner_setup_token');
  const result = await auth.prepareGitHubAccess({
    repository: 'https://github.com/sample-org/company.git',
    companyDirectory: join(f.root, 'company'),
    env: f.env,
    interactive: true,
    method: 'token',
    question: async () => '',
    notice: (text) => messages.push(text),
    readSecret: async () => {
      assert.match(messages.join('\n'), /Contents|selected repositor/i);
      secretRead = true;
      return token;
    },
  });
  assert.equal(secretRead, true);
  assert.equal(result.mode, 'token');
  assert.equal(result.account, 'sample-member');
  const call = JSON.parse(await readFile(f.capture, 'utf8'));
  assert.ok(call.args.includes('--with-token'));
  assert.ok(call.args.includes('--insecure-storage'));
  assert.equal(call.tokenEnv, null);
  assert.equal(call.input, 'github_pat_synthetic_owner_setup_token');
  assert.ok(token.every((byte) => byte === 0));
  assert.doesNotMatch(
    JSON.stringify(call.args) + messages.join('\n'),
    /github_pat_synthetic/,
  );
  assert.match(messages.join('\n'), /Member|member/);
  assert.match(messages.join('\n'), /unencrypted|not encrypted/);
  const client = auth.githubClientEnvironment(f.env, result.profileDirectory);
  assert.equal(client.GH_CONFIG_DIR, result.profileDirectory);
  assert.equal(client.GH_TOKEN, undefined);
  assert.doesNotMatch(JSON.stringify(client), /github_pat_synthetic/);
});
test('existing credentials never launch login and OAuth is not a default fallback', async (t) => {
  const f = await fixture(t);
  const labels = [];
  const result = await auth.prepareGitHubAccess({
    repository: 'https://github.com/sample-org/company.git',
    companyDirectory: join(f.root, 'company'),
    env: f.env,
    interactive: true,
    question: async (label, fallback) => {
      labels.push([label, fallback]);
      return 'existing';
    },
    notice: () => {},
  });
  assert.equal(result.mode, 'existing');
  assert.ok(labels.some(([, fallback]) => fallback === 'token'));
  await assert.rejects(readFile(f.capture));
});
test('token-file setup works headlessly without token arguments and rejects insecure/foreign input', async (t) => {
  const f = await fixture(t);
  const secrets = join(f.root, 'secrets');
  await mkdir(secrets, { mode: 0o700 });
  const path = join(secrets, 'github');
  await writeFile(path, 'github_pat_synthetic_file_setup_token', {
    mode: 0o600,
  });
  const result = await auth.prepareGitHubAccess({
    repository: 'https://github.com/sample-org/company.git',
    companyDirectory: join(f.root, 'company'),
    env: f.env,
    interactive: false,
    tokenFile: path,
    notice: () => {},
  });
  assert.equal(result.mode, 'token');
  await assert.rejects(
    auth.prepareGitHubAccess({
      repository: 'git@github.com:sample-org/company.git',
      companyDirectory: join(f.root, 'company'),
      env: f.env,
      interactive: false,
      tokenFile: path,
      notice: () => {},
    }),
  );
});
test('real Git credential transport uses the MZ profile and removes an unrelated ambient token without global config changes', async (t) => {
  const f = await fixture(t);
  const { promisify } = await import('node:util');
  const { execFile } = await import('node:child_process');
  const execute = promisify(execFile);
  const company = join(f.root, 'company');
  await mkdir(company, { mode: 0o700 });
  await execute('git', ['init', '-q', company]);
  const profile = join(f.root, 'config/mz/github');
  await mkdir(profile, { recursive: true, mode: 0o700 });
  await writeFile(
    join(f.root, 'bin/gh'),
    `#!${process.execPath}\nlet data='';for await(const value of process.stdin)data+=value;if(process.env.GH_CONFIG_DIR!==${JSON.stringify(profile)}||process.env.GH_TOKEN!==undefined||!data.includes('host=github.com'))process.exit(9);process.stdout.write('username=x-access-token\\npassword=github_pat_synthetic_transport_value\\n\\n');`,
    { mode: 0o700 },
  );
  await auth.bindGitHubProfile(company, profile, f.env);
  await auth.bindGitHubProfile(company, profile, f.env);
  const result = await new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      ['-C', company, 'credential', 'fill'],
      {
        env: {
          ...f.env,
          GH_TOKEN: 'unrelated_parent_token',
          GIT_TERMINAL_PROMPT: '0',
        },
      },
      (error, stdout, stderr) =>
        error ? reject(new Error(stderr)) : resolve(stdout),
    );
    child.stdin.end(
      'protocol=https\nhost=github.com\npath=sample-org/company.git\n\n',
    );
  });
  assert.match(result, /password=github_pat_synthetic_transport_value/);
  assert.doesNotMatch(result, /unrelated_parent_token/);
  const helper = await execute(
    'git',
    [
      '-C',
      company,
      'config',
      '--local',
      '--get-all',
      'credential.https://github.com.helper',
    ],
    { env: f.env },
  );
  assert.equal(helper.stdout.trim().split('\n').filter(Boolean).length, 1);
  const profileEnv = await auth.companyGitHubEnvironment(company, {
    ...f.env,
    GH_TOKEN: 'unrelated_parent_token',
  });
  assert.equal(profileEnv.GH_CONFIG_DIR, profile);
  assert.equal(profileEnv.GH_TOKEN, undefined);
});
test('a native credential-store file alias is rejected before reading or storing a token', async (t) => {
  const f = await fixture(t);
  const profile = join(f.root, 'config/mz/github');
  await mkdir(profile, { recursive: true, mode: 0o700 });
  const target = join(f.root, 'unrelated.yml');
  await writeFile(target, 'Unrelated owner data.', { mode: 0o600 });
  const { symlink } = await import('node:fs/promises');
  await symlink(target, join(profile, 'hosts.yml'));
  let entered = false;
  await assert.rejects(
    auth.prepareGitHubAccess({
      repository: 'https://github.com/sample-org/company.git',
      companyDirectory: join(f.root, 'company'),
      env: f.env,
      interactive: true,
      method: 'token',
      notice: () => {},
      readSecret: async () => {
        entered = true;
        return Buffer.from('github_pat_synthetic_do_not_read');
      },
    }),
  );
  assert.equal(entered, false);
  assert.equal(await readFile(target, 'utf8'), 'Unrelated owner data.');
  await assert.rejects(readFile(f.capture));
});
