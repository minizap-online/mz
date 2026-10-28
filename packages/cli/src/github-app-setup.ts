import { appSetupAccessInstructions } from './github-app-access.js';
import { lstat, unlink, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readPrivateArtifact, writePrivateArtifact } from '@mz/core';
import {
  appPermissions,
  convertAppManifest,
  discoverAppConnection,
} from '@mz/github';
import {
  appDirectory,
  loadAppConnection,
  saveAppConnection,
  type AppStoreOptions,
} from './github-app-store.js';
const escape = (s: string): string =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
export async function startAppSetup(
  options: AppStoreOptions & {
    organization: string;
    owner: string;
    origin?: string;
    port?: number;
    timeoutMs?: number;
  },
) {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(options.organization) ||
    !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(options.owner)
  )
    throw new Error('Invalid GitHub identity.');
  const state = randomBytes(32).toString('hex');
  // Persist intent before exposing a registration form: GitHub may create the App even if its return is lost.
  await writePrivateArtifact(
    join(appDirectory(options.env), 'registration.json'),
    JSON.stringify({
      schemaVersion: 1,
      organization: options.organization,
      owner: options.owner,
    }) + '\n',
    [options.companyDirectory],
  );
  // Assigned before the listener can accept a setup request.
  // eslint-disable-next-line prefer-const
  let base: URL;
  let busy = false,
    consumed = false;
  let resolveDone: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const directory = appDirectory(options.env);
  const send = (res: ServerResponse, status: number, text: string): void => {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'none'; form-action https://github.com; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(text);
  };
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', base);
      if (
        req.method !== 'GET' ||
        req.headers.host !== base.host ||
        (req.headers.origin && req.headers.origin !== base.origin) ||
        url.searchParams.get('state') !== state
      ) {
        send(res, 403, 'Setup request rejected. Return to MZ.');
        return;
      }
      if (url.pathname === '/start') {
        const manifest = {
          name: 'MZ-' + options.organization,
          url: 'https://github.com/minizap-online/mz',
          public: false,
          request_oauth_on_install: false,
          // GitHub validates the URL even when inactive; this public placeholder receives no events.
          hook_attributes: {
            active: false,
            url: 'https://github.com/minizap-online/mz',
          },
          default_events: [],
          redirect_url: base.origin + '/manifest',
          setup_url: base.origin + '/installed?state=' + state,
          default_permissions: appPermissions,
        };
        send(
          res,
          200,
          '<h1>Connect MZ to ' +
            escape(options.organization) +
            '</h1><p>You keep organization ownership. This App cannot change memberships. Install for all repositories. No personal user authorization is requested.</p><form method="post" action="https://github.com/organizations/' +
            options.organization +
            '/settings/apps/new?state=' +
            state +
            '"><input type="hidden" name="manifest" value="' +
            escape(JSON.stringify(manifest)) +
            '"><button>Review and register MZ App on GitHub</button></form>',
        );
        return;
      }
      if (url.pathname === '/manifest') {
        if (busy || consumed) {
          send(
            res,
            409,
            'This registration return has already been consumed. Return to MZ.',
          );
          return;
        }
        busy = true;
        try {
          const result = await convertAppManifest(
            url.searchParams.get('code') ?? '',
            options.request,
          );
          consumed = true;
          if (
            typeof result['pem'] !== 'string' ||
            typeof result['id'] !== 'number' ||
            typeof result['slug'] !== 'string' ||
            !/^[a-z0-9-]{1,100}$/.test(result['slug'])
          )
            throw new Error();
          const keyFile = randomUUID() + '.pem';
          await writePrivateArtifact(join(directory, keyFile), result['pem'], [
            options.companyDirectory,
          ]);
          await writePrivateArtifact(
            join(directory, 'pending.json'),
            JSON.stringify({
              schemaVersion: 1,
              appId: result['id'],
              keyFile,
              organization: options.organization,
              owner: options.owner,
              slug: result['slug'],
            }) + '\n',
            [options.companyDirectory],
          );
          send(
            res,
            200,
            '<p>Registration received. Keep MZ running, then install for all repositories:</p><a href="https://github.com/apps/' +
              result['slug'] +
              '/installations/new">Review installation on GitHub</a>',
          );
        } finally {
          busy = false;
        }
        return;
      }
      if (url.pathname === '/installed') {
        if (busy) {
          send(res, 409, 'Setup is processing; retry after it finishes.');
          return;
        }
        busy = true;
        try {
          await completePendingApp(options);
          send(
            res,
            200,
            '<p>MZ connected. Your owner access is unchanged. Return to the MZ terminal.</p>',
          );
          resolveDone?.();
        } finally {
          busy = false;
        }
        return;
      }
      send(res, 404, 'Unknown setup route.');
    })().catch(() => {
      send(
        res,
        400,
        'Setup could not complete. Return to MZ; no credential details are displayed.',
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error();
  base = new URL(options.origin ?? 'http://127.0.0.1:' + address.port);
  if (
    base.pathname !== '/' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !(
      base.protocol === 'https:' ||
      (base.protocol === 'http:' &&
        ['127.0.0.1', 'localhost'].includes(base.hostname))
    )
  ) {
    server.close();
    throw new Error('Setup origin must be HTTPS or forwarded loopback.');
  }
  const timer = setTimeout(() => server.close(), options.timeoutMs ?? 600000);
  timer.unref();
  const close = (): void => {
    clearTimeout(timer);
    server.closeAllConnections();
    server.close();
    resolveDone?.();
  };
  server.once('close', () => {
    clearTimeout(timer);
    resolveDone?.();
  });
  return {
    url: base.origin + '/start?state=' + state,
    localPort: address.port,
    done,
    close,
  };
}
export async function completePendingApp(
  options: AppStoreOptions,
): Promise<void> {
  const directory = appDirectory(options.env);
  const pending = JSON.parse(
    (
      await readPrivateArtifact(join(directory, 'pending.json'), [
        options.companyDirectory,
      ])
    ).toString('utf8'),
  ) as Record<string, unknown>;
  if (
    pending['schemaVersion'] !== 1 ||
    typeof pending['appId'] !== 'number' ||
    typeof pending['keyFile'] !== 'string' ||
    !/^[a-f0-9-]{36}\.pem$/.test(pending['keyFile']) ||
    typeof pending['organization'] !== 'string' ||
    typeof pending['owner'] !== 'string'
  )
    throw new Error('Pending App setup unavailable.');
  const privateKey = () =>
    readPrivateArtifact(join(directory, pending['keyFile'] as string), [
      options.companyDirectory,
    ]);
  const connection = await discoverAppConnection({
    appId: pending['appId'],
    organization: pending['organization'],
    owner: pending['owner'],
    privateKey,
    ...(options.request ? { request: options.request } : {}),
  });
  await saveAppConnection({
    ...options,
    connection,
    privateKey: await privateKey(),
  });
}
export async function connectGitHubApp(
  options: AppStoreOptions & {
    question: (label: string, fallback: string) => Promise<string>;
    notice: (text: string) => void;
    origin?: string;
    port?: number;
  },
): Promise<void> {
  const existing = await loadAppConnection(options);
  if (existing) {
    await existing.app.verify();
    options.notice(
      'Existing MZ GitHub App verified; owner access unchanged.\n',
    );
    return;
  }
  const pendingPath = join(appDirectory(options.env), 'pending.json');
  let pendingExists = false;
  try {
    await lstat(pendingPath);
    pendingExists = true;
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
  if (pendingExists) {
    await readPrivateArtifact(pendingPath, [options.companyDirectory]);
    options.notice(
      'Resuming the existing App registration; finish its GitHub installation, then return here.\n',
    );
    await options.question(
      'Press Enter after the existing App is installed',
      '',
    );
    await completePendingApp(options);
    return;
  }
  const registrationPath = join(appDirectory(options.env), 'registration.json');
  let registrationExists = false;
  try {
    await lstat(registrationPath);
    registrationExists = true;
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
  let selection: { organization: string; owner: string } | undefined;
  if (registrationExists) {
    const record = JSON.parse(
      (
        await readPrivateArtifact(registrationPath, [options.companyDirectory])
      ).toString('utf8'),
    ) as Record<string, unknown>;
    if (
      record['schemaVersion'] !== 1 ||
      typeof record['organization'] !== 'string' ||
      typeof record['owner'] !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(record['organization']) ||
      !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(record['owner']) ||
      Object.keys(record).sort().join(',') !==
        'organization,owner,schemaVersion'
    )
      throw new Error('Invalid registration intent.');
    options.notice(
      'An earlier App registration is unfinished. If an App was created or its credential response was lost, recover that registration/key in GitHub and use --github-app-file. MZ will preserve this intent unless you confirm GitHub rejected the form before creating an App.\n',
    );
    const rejected = await options.question(
      'Did GitHub reject the registration form before creating an App? (yes/no)',
      'no',
    );
    if (!/^(yes|y)$/i.test(rejected.trim()))
      throw new Error('Existing registration requires recovery/import.');
    // Only discard the validated intent, never a pending key or a working connection.
    if (await loadAppConnection(options))
      throw new Error('An App connection is already present.');
    try {
      await lstat(pendingPath);
      throw new Error('Pending App credentials require recovery.');
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
    await unlink(registrationPath);
    const parent = await open(
      appDirectory(options.env),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
    selection = {
      organization: record['organization'],
      owner: record['owner'],
    };
  }
  const organization =
    selection?.organization ??
    (await options.question('GitHub organization for this MZ connection', ''));
  const owner =
    selection?.owner ??
    (await options.question(
      'Your GitHub username (must remain organization Owner)',
      '',
    ));
  options.notice(
    'MZ GitHub App: organization-wide repository access; Contents/Issues/Pull requests/Repository creation and organization Projects write; Metadata/Members read only. No membership changes, repository Administration, user OAuth, or personal-token fallback. You retain owner control and can uninstall it in GitHub. App signing key stays in private host files; this devbox steward is a trusted host operator.\n',
  );
  const flow = await startAppSetup({ ...options, organization, owner });
  try {
    options.notice(appSetupAccessInstructions(flow, options.env));
    await flow.done;
    const saved = await loadAppConnection(options);
    if (!saved)
      throw new Error('App setup did not finish; rerun init to resume.');
  } finally {
    flow.close();
  }
}
