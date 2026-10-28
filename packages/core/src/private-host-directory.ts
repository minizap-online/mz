import { lstat, realpath, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, join, relative } from 'node:path';

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

/** Trusted host setup only: private data outside Git and outside supplied knowledge roots. */
export async function preparePrivateHostDirectory(
  input: string,
  forbiddenRoots: readonly string[] = [],
  create = true,
): Promise<string> {
  try {
    if (!isAbsolute(input) || input.includes('\0') || resolve(input) !== input)
      throw new Error();
    for (const root of forbiddenRoots) {
      if (!isAbsolute(root)) throw new Error();
      const path = relative(resolve(root), input);
      if (
        path === '' ||
        !(path === '..' || path.startsWith('../') || isAbsolute(path))
      )
        throw new Error();
    }
    const exists = async (path: string): Promise<boolean> => {
      try {
        await lstat(path);
        return true;
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          return false;
        throw error;
      }
    };
    let parent = input;
    while (true) {
      if (
        (await exists(join(parent, '.git'))) ||
        ((await exists(join(parent, 'HEAD'))) &&
          (await exists(join(parent, 'objects'))) &&
          (await exists(join(parent, 'refs'))))
      )
        throw new Error();
      const next = dirname(parent);
      if (next === parent) break;
      parent = next;
    }
    if (create) await mkdir(input, { recursive: true, mode: 0o700 });
    const root = await privateHostDirectory(input);
    if (root !== input) throw new Error();
    return root;
  } catch {
    throw new Error(
      'Use a private host credential directory outside Git and company knowledge.',
    );
  }
}
