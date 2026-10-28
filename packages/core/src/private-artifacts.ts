import { constants } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { preparePrivateHostDirectory } from './private-host-directory.js';
import { stewardSync } from './steward-artifacts.js';
export async function readPrivateArtifact(
  path: string,
  forbiddenRoots: readonly string[] = [],
  maximum = 65536,
): Promise<Buffer> {
  try {
    await preparePrivateHostDirectory(dirname(path), forbiddenRoots, false);
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        (stat.mode & 0o177) !== 0 ||
        (stat.uid !== 0 && stat.uid !== process.geteuid?.()) ||
        stat.size > maximum
      )
        throw new Error();
      const bytes = Buffer.alloc(maximum + 1);
      let size = 0;
      while (size < bytes.length) {
        const r = await file.read(bytes, size, bytes.length - size, size);
        if (!r.bytesRead) break;
        size += r.bytesRead;
      }
      if (size > maximum) throw new Error();
      return bytes.subarray(0, size);
    } finally {
      await file.close();
    }
  } catch {
    throw new Error('Private host artifact unavailable.');
  }
}
export async function writePrivateArtifact(
  path: string,
  data: string | Buffer,
  forbiddenRoots: readonly string[] = [],
  replace = false,
): Promise<void> {
  let temporary: string | undefined;
  try {
    const root = await preparePrivateHostDirectory(
      dirname(path),
      forbiddenRoots,
    );
    if (replace) {
      await readPrivateArtifact(path, forbiddenRoots);
      temporary = join(root, '.publish-' + randomUUID());
    }
    const file = await open(
      temporary ?? path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(data);
      await file.sync();
    } finally {
      await file.close();
    }
    if (temporary) await rename(temporary, path);
    await stewardSync(root);
  } catch {
    throw new Error('Private host artifact could not be published.');
  } finally {
    if (temporary) await unlink(temporary).catch(() => undefined);
  }
}
