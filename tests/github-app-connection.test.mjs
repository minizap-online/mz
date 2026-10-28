import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
const key = generateKeyPairSync('rsa', {
  modulusLength: 2048,
}).privateKey.export({ type: 'pkcs8', format: 'pem' });
const c = {
  schemaVersion: 1,
  appId: 7,
  installationId: 8,
  organizationId: 9,
  organization: 'sample-org',
  ownerId: 10,
  owner: 'human',
};
const permissions = {
  metadata: 'read',
  contents: 'write',
  issues: 'write',
  pull_requests: 'write',
  repository_creation: 'write',
  organization_projects: 'write',
  members: 'read',
};
const request = async (method, path, body) => {
  if (path === '/app')
    return {
      id: 7,
      slug: 'sample-app',
      owner: { id: 9, type: 'Organization' },
      permissions,
    };
  if (path === '/app/installations/8')
    return {
      id: 8,
      app_id: 7,
      account: { id: 9, type: 'Organization', login: 'sample-org' },
      suspended_at: null,
      repository_selection: 'all',
      permissions,
    };
  if (path.endsWith('/access_tokens'))
    return {
      token: 'ghs_synthetic',
      expires_at: new Date(Date.now() + 3500000).toISOString(),
      permissions: { metadata: 'read', ...body.permissions },
    };
  if (path.endsWith('/memberships/human'))
    return { state: 'active', role: 'admin', user: { id: 10 } };
  throw Error('unexpected');
};
test('App connection privately publishes only after verification and rejects mismatched saved selection', async (t) => {
  let store;
  try {
    store = await import('../packages/cli/dist/github-app-store.js');
  } catch {
    /* Missing feature is asserted below during RED. */
  }
  assert.equal(typeof store?.saveAppConnection, 'function');
  const root = await mkdtemp(join(tmpdir(), 'mz-app-connection-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = {
    companyDirectory: join(root, 'company'),
    env: { MZ_CONFIG_FILE: join(root, 'config/config.json') },
    request,
  };
  await store.saveAppConnection({
    ...options,
    connection: c,
    privateKey: Buffer.from(key),
  });
  const saved = await store.loadAppConnection(options);
  assert.equal(saved.connection.ownerId, 10);
  assert.doesNotMatch(JSON.stringify(saved.connection), /PRIVATE KEY/);
  await saved.app.verify();
  const metadata = await readFile(
    join(root, 'config/github-app/connection.json'),
    'utf8',
  );
  assert.doesNotMatch(metadata, /PRIVATE KEY/);
  await assert.rejects(() =>
    store.saveAppConnection({
      ...options,
      connection: { ...c, ownerId: 99 },
      privateKey: Buffer.from(key),
    }),
  );
  assert.equal((await store.loadAppConnection(options)).connection.ownerId, 10);
});
test('manifest setup rejects cross-site request and mismatched state before credential conversion', async (t) => {
  let setup;
  try {
    setup = await import('../packages/cli/dist/github-app-setup.js');
  } catch {
    /* Missing feature is asserted below during RED. */
  }
  assert.equal(typeof setup?.startAppSetup, 'function');
  const root = await mkdtemp(join(tmpdir(), 'mz-app-browser-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let conversions = 0;
  const flow = await setup.startAppSetup({
    organization: 'sample-org',
    owner: 'human',
    companyDirectory: join(root, 'company'),
    env: { MZ_CONFIG_FILE: join(root, 'config/config.json') },
    request: async () => {
      conversions++;
      throw Error();
    },
  });
  t.after(() => flow.close());
  const base = new URL(flow.url);
  const wrong = await fetch(
    base.origin + '/manifest?state=wrong&code=synthetic',
  );
  assert.equal(wrong.status, 403);
  assert.equal(conversions, 0);
  const page = await fetch(flow.url);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /repository_creation/);
  assert.doesNotMatch(html, /'members':'write'/);
  const crossed = await fetch(flow.url, {
    headers: { Origin: 'https://evil.example' },
  });
  assert.equal(crossed.status, 403);
});
test('App-bound company clears ambient credentials and installs a fail-closed gh client', async (t) => {
  const store = await import('../packages/cli/dist/github-app-store.js');
  const transport =
    await import('../packages/cli/dist/github-app-transport.js');
  const root = await mkdtemp(join(tmpdir(), 'mz-app-native-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { mkdir } = await import('node:fs/promises');
  const { promisify } = await import('node:util');
  const { execFile } = await import('node:child_process');
  const execute = promisify(execFile);
  const company = join(root, 'company');
  await mkdir(company);
  await execute('git', ['init', '-q', company]);
  const env = {
    ...process.env,
    MZ_CONFIG_FILE: join(root, 'config/config.json'),
    GH_TOKEN: 'synthetic-ambient',
    GITHUB_TOKEN: 'synthetic-other',
    DBUS_SESSION_BUS_ADDRESS: 'synthetic-codex-bus',
  };
  await store.saveAppConnection({
    companyDirectory: company,
    env,
    request,
    connection: c,
    privateKey: Buffer.from(key),
  });
  await transport.bindAppGit(company, env);
  const auth = await import('../packages/cli/dist/github-auth.js');
  const scoped = await auth.companyGitHubEnvironment(company, env);
  assert.equal(scoped.GH_TOKEN, undefined);
  assert.equal(scoped.DBUS_SESSION_BUS_ADDRESS, env.DBUS_SESSION_BUS_ADDRESS);
  assert.match(scoped.PATH, /github-app\/bin/);
  const native = await execute('gh', ['auth', 'token'], { env: scoped }).then(
    () => true,
    () => false,
  );
  assert.equal(
    native,
    false,
    'App wrapper must not authenticate using ambient personal credentials',
  );
  const gitConfig = (
    await execute('git', [
      '-C',
      company,
      'config',
      '--local',
      '--get-all',
      'credential.https://github.com.helper',
    ])
  ).stdout;
  assert.match(gitConfig, /github credential/);
  assert.doesNotMatch(gitConfig, /synthetic-ambient/);
});
test('manifest conversion and installation return finish one protected connection without user OAuth', async (t) => {
  const setup = await import('../packages/cli/dist/github-app-setup.js');
  const store = await import('../packages/cli/dist/github-app-store.js');
  const root = await mkdtemp(join(tmpdir(), 'mz-app-complete-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let conversions = 0;
  const options = {
    organization: 'sample-org',
    owner: 'human',
    companyDirectory: join(root, 'company'),
    env: { MZ_CONFIG_FILE: join(root, 'config/config.json') },
    request: async (method, path, body) => {
      if (path.startsWith('/app-manifests/')) {
        conversions++;
        return { id: 7, slug: 'sample-app', pem: key };
      }
      if (path === '/orgs/sample-org') return { id: 9 };
      if (path === '/users/human') return { id: 10 };
      if (path === '/orgs/sample-org/installation') return { id: 8 };
      return request(method, path, body);
    },
  };
  const flow = await setup.startAppSetup(options);
  t.after(() => flow.close());
  const url = new URL(flow.url);
  const query = url.search;
  const converted = await fetch(
    url.origin + '/manifest' + query + '&code=synthetic_code',
  );
  assert.equal(converted.status, 200);
  assert.match(await converted.text(), /installations\/new/);
  const replay = await fetch(
    url.origin + '/manifest' + query + '&code=synthetic_code',
  );
  assert.equal(replay.status, 409);
  assert.equal(conversions, 1);
  const installed = await fetch(
    url.origin + '/installed' + query + '&installation_id=8',
  );
  assert.equal(installed.status, 200);
  await flow.done;
  assert.equal((await store.loadAppConnection(options)).connection.ownerId, 10);
});
test('init imports and reuses App connection headlessly without opening login or replacing personal profiles', async (t) => {
  const { runInitCli } = await import('../packages/cli/dist/init.js');
  const root = await mkdtemp(join(tmpdir(), 'mz-app-init-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { writeFile } = await import('node:fs/promises');
  const file = join(root, 'app.json');
  await writeFile(file, JSON.stringify({ ...c, privateKey: key }), {
    mode: 0o600,
  });
  const env = {
    ...process.env,
    MZ_CONFIG_FILE: join(root, 'config/config.json'),
    XDG_STATE_HOME: join(root, 'state'),
    XDG_DATA_HOME: join(root, 'data'),
  };
  const result = await runInitCli(['--yes', '--github-app-file', file], {
    env,
    githubRequest: request,
  });
  assert.equal(result.exitCode, 0, result.stderr);
  const next = await runInitCli(['--yes', '--github-auth', 'app'], {
    env,
    githubRequest: request,
  });
  assert.equal(next.exitCode, 0, next.stderr);
});
test('real Git credential fill uses a narrowed App token through the native helper without network', async (t) => {
  const store = await import('../packages/cli/dist/github-app-store.js');
  const transport =
    await import('../packages/cli/dist/github-app-transport.js');
  const root = await mkdtemp(join(tmpdir(), 'mz-app-git-real-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { promisify } = await import('node:util');
  const { execFile } = await import('node:child_process');
  const { pathToFileURL } = await import('node:url');
  const execute = promisify(execFile);
  const company = join(root, 'company');
  await mkdir(company, { mode: 0o700 });
  await execute('git', ['init', '-q', company]);
  const mock = join(root, 'fetch.mjs');
  await writeFile(
    mock,
    `const permissions=${JSON.stringify(permissions)};globalThis.fetch=async(url,options)=>{const path=new URL(url).pathname;const body=options.body?JSON.parse(options.body):{};let result;if(path==='/app')result={id:7,owner:{id:9,type:'Organization'},permissions};else if(path==='/app/installations/8')result={id:8,app_id:7,account:{id:9,type:'Organization',login:'sample-org'},suspended_at:null,repository_selection:'all',permissions};else if(path.endsWith('/access_tokens'))result={token:body.repository_ids?'ghs_synthetic_narrow_repo':'ghs_synthetic_read_only',expires_at:new Date(Date.now()+3500000).toISOString(),permissions:{metadata:'read',...body.permissions},...(body.repository_ids?{repositories:body.repository_ids.map(id=>({id}))}:{})};else if(path.endsWith('/memberships/human'))result={state:'active',role:'admin',user:{id:10}};else if(path==='/repos/sample-org/website')result={id:11,name:'website',private:true,owner:{id:9}};else throw Error('No real network in fixture');return new Response(JSON.stringify(result),{status:200});};`,
    { mode: 0o600 },
  );
  const env = {
    ...process.env,
    MZ_CONFIG_FILE: join(root, 'config/config.json'),
    NODE_OPTIONS: '--import=' + pathToFileURL(mock).href,
    GH_TOKEN: 'synthetic_personal_should_not_be_used',
  };
  await store.saveAppConnection({
    companyDirectory: company,
    env,
    request,
    connection: c,
    privateKey: Buffer.from(key),
  });
  await transport.bindAppGit(company, env);
  const output = await new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      ['-C', company, 'credential', 'fill'],
      { env },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
    child.stdin.end(
      'protocol=https\nhost=github.com\npath=sample-org/website.git\n\n',
    );
  });
  assert.match(output, /password=ghs_synthetic_narrow_repo/);
  assert.doesNotMatch(output, /synthetic_personal/);
});
test('project CLI creates and resumes a synthetic website through App authorization and Core journal', async (t) => {
  const { runInitCli } = await import('../packages/cli/dist/init.js');
  const { runProjectCli } = await import('../packages/cli/dist/project.js');
  const { saveAppConnection } =
    await import('../packages/cli/dist/github-app-store.js');
  const { GitHubAppError } =
    await import('../packages/providers/github/dist/index.js');
  const root = await mkdtemp(join(tmpdir(), 'mz-app-project-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = {
    ...process.env,
    MZ_CONFIG_FILE: join(root, 'config/config.json'),
    XDG_STATE_HOME: join(root, 'state'),
    XDG_DATA_HOME: join(root, 'data'),
  };
  const initialized = await runInitCli(['--yes'], { env });
  assert.equal(initialized.exitCode, 0);
  let exists = false,
    writes = 0;
  const provider = async (method, path, body) => {
    if (path === '/repos/sample-org/website') {
      if (!exists) throw new GitHubAppError('NOT_FOUND');
      return { id: 11, name: 'website', private: true, owner: { id: 9 } };
    }
    if (path === '/orgs/sample-org/repos') {
      writes++;
      exists = true;
      return {
        id: 11,
        name: body.name,
        private: body.private,
        owner: { id: 9 },
      };
    }
    return request(method, path, body);
  };
  const company = join(root, 'data/mz/company');
  await saveAppConnection({
    companyDirectory: company,
    env,
    connection: c,
    privateKey: Buffer.from(key),
    request: provider,
  });
  const denied = await runProjectCli(['create', 'website'], {
    env,
    request: provider,
  });
  assert.equal(denied.exitCode, 2);
  assert.equal(writes, 0);
  const created = await runProjectCli(['create', 'website', '--approved'], {
    env,
    request: provider,
  });
  assert.equal(created.exitCode, 0, created.stderr);
  const again = await runProjectCli(['create', 'website', '--approved'], {
    env,
    request: provider,
  });
  assert.equal(again.exitCode, 0, again.stderr);
  assert.equal(writes, 1);
  assert.equal(JSON.parse(created.stdout).deployment, 'pending');
  assert.doesNotMatch(created.stdout, /ghs_|PRIVATE KEY/);
});
test('unsafe pending setup cannot be mistaken for absence and start a duplicate registration', async (t) => {
  const { connectGitHubApp } =
    await import('../packages/cli/dist/github-app-setup.js');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'mz-app-pending-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'config/github-app'), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(join(root, 'config/github-app/pending.json'), '{}', {
    mode: 0o644,
  });
  let questions = 0;
  await assert.rejects(() =>
    connectGitHubApp({
      companyDirectory: join(root, 'company'),
      env: { MZ_CONFIG_FILE: join(root, 'config/config.json') },
      question: async () => {
        questions++;
        return 'sample-org';
      },
      notice: () => {
        throw Error('must not start registration');
      },
    }),
  );
  assert.equal(questions, 0);
});
