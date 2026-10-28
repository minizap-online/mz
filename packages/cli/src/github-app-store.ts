import { dirname, join, resolve } from 'node:path';
import { lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  readPrivateArtifact,
  writePrivateArtifact,
  installationPaths,
} from '@mz/core';
import {
  createGitHubApp,
  validateAppConnection,
  type AppConnection,
  type AppRequest,
} from '@mz/github';
export interface AppStoreOptions {
  companyDirectory: string;
  env: NodeJS.ProcessEnv;
  request?: AppRequest;
}
export function appDirectory(env: NodeJS.ProcessEnv): string {
  return join(
    dirname(resolve(installationPaths(env).configFile)),
    'github-app',
  );
}
export async function loadAppConnection(options: AppStoreOptions) {
  const directory = appDirectory(options.env);
  const file = join(directory, 'connection.json');
  try {
    await lstat(file);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return null;
    throw error;
  }
  const raw = JSON.parse(
    (await readPrivateArtifact(file, [options.companyDirectory])).toString(
      'utf8',
    ),
  ) as Record<string, unknown>;
  if (
    raw['schemaVersion'] !== 1 ||
    typeof raw['keyFile'] !== 'string' ||
    !/^[a-f0-9-]{36}\.pem$/.test(raw['keyFile']) ||
    Object.keys(raw).sort().join(',') !== 'connection,keyFile,schemaVersion'
  )
    throw new Error('Invalid App connection file.');
  const connection = validateAppConnection(raw['connection']);
  const keyPath = join(directory, raw['keyFile']);
  const app = createGitHubApp({
    connection,
    privateKey: () => readPrivateArtifact(keyPath, [options.companyDirectory]),
    ...(options.request ? { request: options.request } : {}),
  });
  return { connection, app, directory };
}
export async function saveAppConnection(
  options: AppStoreOptions & { connection: AppConnection; privateKey: Buffer },
): Promise<void> {
  try {
    const connection = validateAppConnection(options.connection);
    await createGitHubApp({
      connection,
      privateKey: async () => Buffer.from(options.privateKey),
      ...(options.request ? { request: options.request } : {}),
    }).verify();
    const existing = await loadAppConnection(options);
    if (existing) {
      if (JSON.stringify(existing.connection) !== JSON.stringify(connection))
        throw new Error('Existing App selection differs.');
      await existing.app.verify();
      return;
    }
    const directory = appDirectory(options.env);
    const keyFile = randomUUID() + '.pem';
    await writePrivateArtifact(join(directory, keyFile), options.privateKey, [
      options.companyDirectory,
    ]);
    await writePrivateArtifact(
      join(directory, 'connection.json'),
      JSON.stringify({ schemaVersion: 1, connection, keyFile }) + '\n',
      [options.companyDirectory],
    );
  } finally {
    options.privateKey.fill(0);
  }
}
export async function importAppConnection(
  options: AppStoreOptions & { file: string },
): Promise<void> {
  const bytes = await readPrivateArtifact(resolve(options.file), [
    options.companyDirectory,
  ]);
  try {
    const input = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    if (input['schemaVersion'] !== 1 || typeof input['privateKey'] !== 'string')
      throw new Error('Invalid protected App import.');
    const { privateKey, ...connection } = input;
    await saveAppConnection({
      ...options,
      connection: validateAppConnection(connection),
      privateKey: Buffer.from(privateKey),
    });
  } finally {
    bytes.fill(0);
  }
}
