import { privateHostDirectory } from '../private-host-directory.js';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { createSecretHandle } from './handles.js';
import {
  parseSecretRef,
  SecretError,
  secretFailure,
  secretErrorCode,
  type HostFileSecretProviderOptions,
  type SecretHandle,
  type SecretProvider,
} from './types.js';

const MAX_BYTES = 64 * 1024;
function configuration(
  input: unknown,
  allowed?: readonly string[],
): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new SecretError('INVALID_SECRET_CONFIGURATION');
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== null && prototype !== Object.prototype)
    throw new SecretError('INVALID_SECRET_CONFIGURATION');
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || (allowed && !allowed.includes(key)))
      throw new SecretError('INVALID_SECRET_CONFIGURATION');
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor))
      throw new SecretError('INVALID_SECRET_CONFIGURATION');
    result[key] = descriptor.value;
  }
  return result;
}
function owner(uid: number): boolean {
  if (typeof process.geteuid !== 'function')
    throw new SecretError('UNSUPPORTED_SECRET_HOST');
  return uid === 0 || uid === process.geteuid();
}
async function readSecret(
  directory: string,
  filename: string,
): Promise<Buffer> {
  const buffer = Buffer.alloc(MAX_BYTES + 1);
  try {
    const path = join(directory, filename);
    const before = await lstat(path);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      !owner(before.uid) ||
      (before.mode & 0o177) !== 0
    )
      throw new SecretError('UNSAFE_SECRET_FILE');
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await file.stat();
      if (
        !info.isFile() ||
        info.nlink !== 1 ||
        !owner(info.uid) ||
        (info.mode & 0o177) !== 0
      )
        throw new SecretError('UNSAFE_SECRET_FILE');
      if (info.size < 1 || info.size > MAX_BYTES)
        throw new SecretError('INVALID_SECRET_FILE');
      let size = 0;
      while (size < buffer.length) {
        const { bytesRead } = await file.read(
          buffer,
          size,
          buffer.length - size,
          size,
        );
        if (bytesRead === 0) break;
        size += bytesRead;
      }
      if (size < 1 || size > MAX_BYTES)
        throw new SecretError('INVALID_SECRET_FILE');
      try {
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          buffer.subarray(0, size),
        );
      } catch {
        throw new SecretError('INVALID_SECRET_FILE');
      }
      return Buffer.from(buffer.subarray(0, size));
    } finally {
      await file.close();
    }
  } catch (error) {
    throw secretFailure(error, 'SECRET_FILE_UNAVAILABLE');
  } finally {
    buffer.fill(0);
  }
}

export async function createHostFileSecretProvider(
  options: HostFileSecretProviderOptions,
): Promise<SecretProvider> {
  let directory: string;
  const bindings = new Map<string, string>();
  try {
    if (typeof process.geteuid !== 'function')
      throw new SecretError('UNSUPPORTED_SECRET_HOST');
    const config = configuration(options, ['directory', 'bindings']);
    if (
      typeof config['directory'] !== 'string' ||
      !isAbsolute(config['directory']) ||
      config['directory'].includes('\0')
    )
      throw new SecretError('INVALID_SECRET_CONFIGURATION');
    directory = resolve(config['directory']);
    for (const [ref, filename] of Object.entries(
      configuration(config['bindings']),
    )) {
      parseSecretRef(ref);
      if (
        typeof filename !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(filename)
      )
        throw new SecretError('INVALID_SECRET_CONFIGURATION');
      bindings.set(ref, filename);
    }
  } catch (error) {
    if (secretErrorCode(error) === 'UNSUPPORTED_SECRET_HOST')
      throw new SecretError('UNSUPPORTED_SECRET_HOST');
    throw new SecretError('INVALID_SECRET_CONFIGURATION');
  }
  try {
    directory = await privateHostDirectory(directory);
  } catch {
    throw new SecretError('UNSAFE_SECRET_DIRECTORY');
  }
  return Object.freeze({
    async resolve(reference): Promise<SecretHandle> {
      const ref = parseSecretRef(reference);
      const filename = bindings.get(ref);
      if (filename === undefined) throw new SecretError('UNKNOWN_SECRET_REF');
      try {
        await privateHostDirectory(directory);
      } catch {
        throw new SecretError('UNSAFE_SECRET_DIRECTORY');
      }
      return createSecretHandle(ref, await readSecret(directory, filename));
    },
  } satisfies SecretProvider);
}
