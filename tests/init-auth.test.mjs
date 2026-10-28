import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runInitCli } from '../packages/cli/dist/init.js';
test('interactive init delegates authentication to provider-owned commands instead of collecting keys', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mz-init-auth-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  await mkdir(bin);
  const env = {
    PATH: bin + ':' + process.env.PATH,
    MZ_CONFIG_FILE: join(root, 'settings/config.json'),
    XDG_STATE_HOME: join(root, 'state'),
    XDG_DATA_HOME: join(root, 'data'),
    MZ_TEST_AUTH_ROOT: root,
  };
  const prefix = `#!${process.execPath}\nimport fs from 'node:fs';import path from 'node:path';const root=process.env.MZ_TEST_AUTH_ROOT;const args=process.argv.slice(2);\n`;
  await writeFile(
    join(bin, 'codex'),
    prefix +
      `if(args[0]==='--version')process.exit(0);if(args[0]==='login'&&args[1]==='status')process.exit(fs.existsSync(path.join(root,'codex-auth'))?0:1);if(args[0]==='login'){fs.writeFileSync(path.join(root,'codex-auth'),'provider owns authentication');process.exit(0);}process.exit(9);`,
    { mode: 0o700 },
  );
  await writeFile(
    join(bin, 'git'),
    prefix +
      `if(args[0]==='clone'){if(!fs.existsSync(path.join(root,'github-auth')))process.exit(128);fs.mkdirSync(args.at(-1),{recursive:true,mode:448});process.exit(0);}if(args.includes('config'))process.exit(0);process.exit(9);`,
    { mode: 0o700 },
  );
  await writeFile(
    join(bin, 'gh'),
    prefix +
      `if(args[0]==='auth'&&args[1]==='login'){fs.writeFileSync(path.join(root,'github-auth'),'provider owns authentication');fs.writeFileSync(path.join(process.env.GH_CONFIG_DIR,'hosts.yml'),'{}',{mode:384});process.exit(0);}if(args[0]==='auth'&&args[1]==='setup-git')process.exit(0);if(args[0]==='api'){console.log('sample-member');process.exit(0);}process.exit(9);`,
    { mode: 0o700 },
  );
  const prompts = [];
  const result = await runInitCli(
    ['--repository', 'https://github.com/example/company.git'],
    {
      env,
      terminal: true,
      notice: () => {},
      question: async (label, fallback) => {
        prompts.push(label);
        if (/GitHub authentication method/.test(label)) return 'oauth';
        return /sign.in|authenticate/i.test(label) ? 'yes' : fallback;
      },
    },
  );
  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /existing login available/);
  assert.ok(prompts.some((label) => /GitHub/i.test(label)));
  assert.ok(prompts.some((label) => /Codex/i.test(label)));
  assert.doesNotMatch(
    JSON.stringify(prompts),
    /paste.*key|token value|password/i,
  );
  assert.equal(
    await readFile(join(root, 'codex-auth'), 'utf8'),
    'provider owns authentication',
  );
});
test('SSH repository authentication selects SSH key setup and preserves the selected transport', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mz-init-ssh-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  await mkdir(bin);
  const env = {
    PATH: bin + ':' + process.env.PATH,
    MZ_CONFIG_FILE: join(root, 'settings/config.json'),
    XDG_STATE_HOME: join(root, 'state'),
    XDG_DATA_HOME: join(root, 'data'),
    MZ_TEST_AUTH_ROOT: root,
  };
  const prefix = `#!${process.execPath}\nimport fs from 'node:fs';import path from 'node:path';const root=process.env.MZ_TEST_AUTH_ROOT;const args=process.argv.slice(2);\n`;
  await writeFile(join(bin, 'codex'), prefix + `process.exit(0);`, {
    mode: 0o700,
  });
  await writeFile(
    join(bin, 'gh'),
    prefix +
      `if(args[0]==='auth'&&args[1]==='login'){fs.writeFileSync(path.join(root,'auth.json'),JSON.stringify(args));fs.writeFileSync(path.join(process.env.GH_CONFIG_DIR,'hosts.yml'),'{}',{mode:384});process.exit(0);}if(args[0]==='api'){console.log('sample-member');process.exit(0);}process.exit(9);`,
    { mode: 0o700 },
  );
  await writeFile(
    join(bin, 'git'),
    prefix +
      `if(args[0]==='clone'){if(!fs.existsSync(path.join(root,'auth.json')))process.exit(128);const auth=JSON.parse(fs.readFileSync(path.join(root,'auth.json')));if(auth[auth.indexOf('--git-protocol')+1]!=='ssh')process.exit(128);if(args[2]!=='git@github.com:example/company.git')process.exit(9);fs.mkdirSync(args.at(-1),{recursive:true,mode:448});process.exit(0);}if(args.includes('config'))process.exit(0);process.exit(9);`,
    { mode: 0o700 },
  );
  const result = await runInitCli(
    ['--repository', 'git@github.com:example/company.git'],
    {
      env,
      terminal: true,
      notice: () => {},
      question: async (label, fallback) =>
        /GitHub authentication method/.test(label)
          ? 'oauth'
          : /authenticate/i.test(label)
            ? 'yes'
            : fallback,
    },
  );
  assert.equal(result.exitCode, 0, result.stderr);
  const auth = JSON.parse(await readFile(join(root, 'auth.json'), 'utf8'));
  assert.equal(auth[auth.indexOf('--git-protocol') + 1], 'ssh');
});
