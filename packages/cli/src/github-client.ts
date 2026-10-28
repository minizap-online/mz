import { constants } from 'node:fs';
import { chmod, lstat, open, readFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { delimiter, isAbsolute, join } from 'node:path';
import { preparePrivateHostDirectory } from '@mz/core';
export const NO_GITHUB_KEYRING = 'unix:path=/dev/null/mz-private-gh-no-keyring';
const marker = '# MZ private GitHub client\n';
const quote = (value: string): string =>
  "'" + value.replaceAll("'", "'\\''") + "'";
function script(profile: string, executable: string): string {
  return (
    '#!/bin/sh\n' +
    marker +
    '# executable-json: ' +
    JSON.stringify(executable) +
    '\nexec env -u GH_TOKEN -u GITHUB_TOKEN -u GH_ENTERPRISE_TOKEN -u GITHUB_ENTERPRISE_TOKEN -u GH_DEBUG GH_CONFIG_DIR=' +
    quote(profile) +
    ' GH_HOST=github.com DBUS_SESSION_BUS_ADDRESS=' +
    quote(NO_GITHUB_KEYRING) +
    ' ' +
    quote(executable) +
    ' "$@"\n'
  );
}
async function nativeExecutable(env: NodeJS.ProcessEnv): Promise<string> {
  for (const directory of (env.PATH ?? '').split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const path = join(directory, 'gh');
    let file;
    try {
      file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        ['ENOENT', 'ENOTDIR'].includes(String(error.code))
      )
        continue;
      // eslint-disable-next-line preserve-caught-error -- Keep host executable paths out of boundary errors.
      throw new Error();
    }
    try {
      const stat = await file.stat();
      if (!stat.isFile() || (stat.mode & 0o111) === 0) continue;
      const head = Buffer.alloc(128);
      const read = await file.read(head, 0, 128, 0);
      if (head.subarray(0, read.bytesRead).toString().includes(marker))
        continue;
      return path;
    } finally {
      await file.close();
    }
  }
  throw new Error('GitHub CLI is unavailable.');
}
export async function preparePrivateGitHubClient(
  profile: string,
  companyDirectory: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  // Native gh on Linux uses Secret Service/D-Bus for the shared keyring. No other platform is silently assumed safe.
  if (process.platform !== 'linux')
    throw new Error(
      'Private GitHub credential setup currently requires the Linux devbox; existing authentication remains available.',
    );
  const bin = await preparePrivateHostDirectory(join(profile, 'bin'), [
    companyDirectory,
  ]);
  const executable = await nativeExecutable(env);
  const target = join(bin, 'gh');
  const content = script(profile, executable);
  try {
    const stat = await lstat(target);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > 8192
    )
      throw new Error();
    const old = await readFile(target, 'utf8');
    const encoded = old.split('\n')[2]?.slice('# executable-json: '.length);
    const oldExecutable = JSON.parse(encoded ?? 'null') as unknown;
    if (
      typeof oldExecutable !== 'string' ||
      old !== script(profile, oldExecutable)
    )
      throw new Error();
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      // eslint-disable-next-line preserve-caught-error -- Credential profile contents and paths are private.
      throw new Error();
  }
  const temporary = join(bin, '.gh-' + randomUUID());
  const file = await open(
    temporary,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o700,
  );
  try {
    await file.writeFile(content, 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(temporary, target);
    await chmod(target, 0o700);
  } finally {
    try {
      await unlink(temporary);
    } catch {
      /* Rename already removed the temporary name; private partial evidence can be inspected on failure. */
    }
  }
}
export async function checkPrivateGitHubClient(
  profile: string,
  companyDirectory: string,
): Promise<void> {
  if (process.platform !== 'linux') throw new Error();
  await preparePrivateHostDirectory(
    join(profile, 'bin'),
    [companyDirectory],
    false,
  );
  const path = join(profile, 'bin/gh');
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o077) !== 0 ||
    stat.size > 8192 ||
    (stat.uid !== 0 && stat.uid !== process.geteuid?.())
  )
    throw new Error();
  const text = await readFile(path, 'utf8');
  const line = text.split('\n')[2];
  if (!line?.startsWith('# executable-json: ')) throw new Error();
  const executable = JSON.parse(
    line.slice('# executable-json: '.length),
  ) as unknown;
  if (
    typeof executable !== 'string' ||
    !isAbsolute(executable) ||
    executable === path ||
    text !== script(profile, executable)
  )
    throw new Error();
}
