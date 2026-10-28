import { createPrivateKey, sign } from 'node:crypto';
import { object, numericId } from './app-policy.js';
export type AppRequest = (
  method: string,
  path: string,
  body: unknown,
  authorization: string,
) => Promise<unknown>;
export class GitHubAppError extends Error {
  constructor(
    readonly code: 'ACCESS' | 'NOT_FOUND' | 'UNAVAILABLE' = 'ACCESS',
  ) {
    super(
      'GitHub App access unavailable; check installation, owner identity and approved permissions.',
    );
    this.name = 'GitHubAppError';
  }
}
export const githubRequest: AppRequest = async (
  method,
  path,
  body,
  authorization,
) => {
  try {
    if (!path.startsWith('/') || path.includes('..'))
      throw new GitHubAppError();
    const response = await fetch('https://api.github.com' + path, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: 'Bearer ' + authorization,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'mz-github-app',
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new GitHubAppError(
        response.status === 404 ? 'NOT_FOUND' : 'UNAVAILABLE',
      );
    }
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (response.body)
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > 1048576) throw new GitHubAppError();
        chunks.push(chunk);
      }
    if (response.status === 204) return null;
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof GitHubAppError) throw error;
    throw new GitHubAppError('UNAVAILABLE');
  }
};
export async function appJwt(
  appId: number,
  key: () => Promise<Buffer>,
): Promise<string> {
  let bytes: Buffer | undefined;
  try {
    numericId(appId);
    bytes = await key();
    const privateKey = createPrivateKey(bytes);
    if (
      privateKey.asymmetricKeyType !== 'rsa' ||
      (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
    )
      throw new Error();
    const now = Math.floor(Date.now() / 1000);
    const text =
      Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
        'base64url',
      ) +
      '.' +
      Buffer.from(
        JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }),
      ).toString('base64url');
    return (
      text +
      '.' +
      sign('RSA-SHA256', Buffer.from(text), privateKey).toString('base64url')
    );
  } catch {
    throw new GitHubAppError();
  } finally {
    bytes?.fill(0);
  }
}
export async function convertAppManifest(
  code: string,
  request: AppRequest = githubRequest,
): Promise<Record<string, unknown>> {
  if (!/^[a-zA-Z0-9_]{1,256}$/.test(code)) throw new GitHubAppError();
  return object(
    await request(
      'POST',
      '/app-manifests/' + code + '/conversions',
      undefined,
      '',
    ),
  );
}
