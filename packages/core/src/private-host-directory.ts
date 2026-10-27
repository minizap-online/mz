import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

/** Shared control-plane filesystem check; throws only a source-safe static error. */
export async function privateHostDirectory(input: string): Promise<string> {
  try {
    if (
      typeof process.geteuid !== 'function' ||
      typeof input !== 'string' ||
      !isAbsolute(input) ||
      input.includes('\0')
    )
      throw new Error();
    const permittedOwner = (uid: number): boolean =>
      uid === 0 || uid === process.geteuid!();
    const selected = resolve(input);
    const root = await lstat(selected);
    if (
      !root.isDirectory() ||
      !permittedOwner(root.uid) ||
      (root.mode & 0o077) !== 0
    )
      throw new Error();
    const canonical = await realpath(selected);
    const resolvedRoot = await lstat(canonical);
    if (
      !resolvedRoot.isDirectory() ||
      !permittedOwner(resolvedRoot.uid) ||
      (resolvedRoot.mode & 0o077) !== 0
    )
      throw new Error();
    let path = dirname(canonical);
    while (true) {
      const info = await lstat(path);
      if (
        !info.isDirectory() ||
        !permittedOwner(info.uid) ||
        ((info.mode & 0o022) !== 0 && (info.mode & 0o1000) === 0)
      )
        throw new Error();
      const parent = dirname(path);
      if (parent === path) break;
      path = parent;
    }
    return canonical;
  } catch {
    throw new Error('Unsafe private host directory.');
  }
}
