import {
  appPermissions,
  checkPermissions,
  githubName,
  numericId,
  object,
  repositoryName,
  validateAppConnection,
  type AppConnection,
  type Permissions,
} from './app-policy.js';
import {
  appJwt,
  githubRequest,
  GitHubAppError,
  type AppRequest,
} from './app-api.js';
export interface AppRepository {
  id: number;
  name: string;
  private: boolean;
  ownerId: number;
}
export function createGitHubApp(options: {
  connection: AppConnection;
  privateKey: () => Promise<Buffer>;
  request?: AppRequest;
}) {
  const c = validateAppConnection(options.connection);
  const request = options.request ?? githubRequest;
  async function call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    return object(
      await request(
        method,
        path,
        body,
        await appJwt(c.appId, options.privateKey),
      ),
    );
  }
  async function token(
    permissions: Permissions,
    repositoryIds?: number[],
  ): Promise<string> {
    const result = await call(
      'POST',
      '/app/installations/' + c.installationId + '/access_tokens',
      {
        ...(repositoryIds ? { repository_ids: repositoryIds } : {}),
        permissions,
      },
    );
    checkPermissions(result['permissions'], permissions);
    const expires = Date.parse(String(result['expires_at']));
    if (
      !Number.isFinite(expires) ||
      expires < Date.now() + 10000 ||
      expires > Date.now() + 3660000
    )
      throw new GitHubAppError();
    if (repositoryIds) {
      const repositories = result['repositories'];
      if (
        !Array.isArray(repositories) ||
        repositories.length !== repositoryIds.length ||
        repositories.some(
          (r) => !repositoryIds.includes(numericId(object(r)['id'])),
        )
      )
        throw new GitHubAppError();
    }
    if (
      typeof result['token'] !== 'string' ||
      result['token'].length < 1 ||
      result['token'].length > 16384 ||
      Array.from(result['token']).some(
        (c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127,
      )
    )
      throw new GitHubAppError();
    return result['token'];
  }
  async function verifyInstallation(): Promise<void> {
    const app = await call('GET', '/app');
    checkPermissions(app['permissions'], appPermissions);
    const owner = object(app['owner']);
    if (
      app['id'] !== c.appId ||
      owner['id'] !== c.organizationId ||
      owner['type'] !== 'Organization'
    )
      throw new GitHubAppError();
    const installation = await call(
      'GET',
      '/app/installations/' + c.installationId,
    );
    checkPermissions(installation['permissions'], appPermissions);
    const account = object(installation['account']);
    if (
      installation['id'] !== c.installationId ||
      installation['app_id'] !== c.appId ||
      account['id'] !== c.organizationId ||
      account['type'] !== 'Organization' ||
      String(account['login']).toLowerCase() !== c.organization.toLowerCase() ||
      installation['repository_selection'] !== 'all' ||
      installation['suspended_at'] !== null
    )
      throw new GitHubAppError();
  }
  async function verify(): Promise<void> {
    await verifyInstallation();
    const auth = await token({ members: 'read' });
    const member = object(
      await request(
        'GET',
        '/orgs/' + c.organization + '/memberships/' + c.owner,
        undefined,
        auth,
      ),
    );
    if (
      member['state'] !== 'active' ||
      member['role'] !== 'admin' ||
      object(member['user'])['id'] !== c.ownerId
    )
      throw new GitHubAppError();
  }
  function repo(value: unknown, name: string): AppRepository {
    const r = object(value);
    if (
      object(r['owner'])['id'] !== c.organizationId ||
      String(r['name']).toLowerCase() !== name.toLowerCase() ||
      typeof r['private'] !== 'boolean'
    )
      throw new GitHubAppError();
    return {
      id: numericId(r['id']),
      name: repositoryName(r['name']),
      private: r['private'],
      ownerId: c.organizationId,
    };
  }
  async function getRepository(name: string): Promise<AppRepository> {
    repositoryName(name);
    await verify();
    const auth = await token({ metadata: 'read' });
    return repo(
      await request(
        'GET',
        '/repos/' + c.organization + '/' + name,
        undefined,
        auth,
      ),
      name,
    );
  }
  return Object.freeze({
    connection: c,
    verify,
    getRepository,
    async withRepositoryToken<T>(
      name: string,
      use: (token: string) => Promise<T>,
    ): Promise<T> {
      const repository = await getRepository(name);
      const credential = await token(
        {
          metadata: 'read',
          contents: 'write',
          issues: 'write',
          pull_requests: 'write',
        },
        [repository.id],
      );
      return use(credential);
    },
    async createRepository(
      name: string,
      isPrivate: boolean,
    ): Promise<AppRepository> {
      repositoryName(name);
      if (typeof isPrivate !== 'boolean') throw new GitHubAppError();
      await verify();
      const auth = await token({ repository_creation: 'write' });
      const result = repo(
        await request(
          'POST',
          '/orgs/' + githubName(c.organization) + '/repos',
          { name, private: isPrivate, auto_init: true },
          auth,
        ),
        name,
      );
      if (result.private !== isPrivate) throw new GitHubAppError();
      return result;
    },
  });
}
export type GitHubApp = ReturnType<typeof createGitHubApp>;
export async function discoverAppConnection(options: {
  appId: number;
  organization: string;
  owner: string;
  privateKey: () => Promise<Buffer>;
  request?: AppRequest;
}): Promise<AppConnection> {
  const request = options.request ?? githubRequest;
  const organization = githubName(options.organization),
    owner = githubName(options.owner);
  const org = object(
    await request('GET', '/orgs/' + organization, undefined, ''),
  );
  const user = object(await request('GET', '/users/' + owner, undefined, ''));
  const installation = object(
    await request(
      'GET',
      '/orgs/' + organization + '/installation',
      undefined,
      await appJwt(options.appId, options.privateKey),
    ),
  );
  const connection: AppConnection = {
    schemaVersion: 1,
    appId: numericId(options.appId),
    installationId: numericId(installation['id']),
    organizationId: numericId(org['id']),
    organization,
    ownerId: numericId(user['id']),
    owner,
  };
  await createGitHubApp({ ...options, connection }).verify();
  return connection;
}
