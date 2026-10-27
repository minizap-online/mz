import { constants } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { parseMarkdown, parseMetadata, validateConfig } from './metadata.js';
import {
  CompanyRepositoryError,
  type CompanyRepository,
  type CompanyRepositoryOptions,
  type CompanyReadOptions,
} from './types.js';

const MAX_FILE_BYTES = 1024 * 1024;

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isContained(root: string, path: string): boolean {
  const part = relative(root, path);
  return part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

async function readContained(
  root: string,
  path: string,
  options?: CompanyReadOptions,
): Promise<string> {
  if (!path || path.includes('\0')) {
    throw new CompanyRepositoryError(
      'INVALID_PATH',
      'Provide a nonempty relative document path.',
      path,
    );
  }
  const target = resolve(root, path);
  if (isAbsolute(path) || !isContained(root, target)) {
    throw new CompanyRepositoryError(
      'PATH_OUTSIDE_REPOSITORY',
      'Choose a relative document path inside the company repository.',
      path,
    );
  }
  try {
    let rejectLinks = false;
    let normalizeLineEndings = false;
    if (options !== undefined) {
      if (
        options === null ||
        typeof options !== 'object' ||
        Array.isArray(options)
      )
        throw new Error();
      const prototype: unknown = Object.getPrototypeOf(options);
      if (prototype !== Object.prototype && prototype !== null)
        throw new Error();
      for (const key of Reflect.ownKeys(options)) {
        if (key !== 'rejectLinks' && key !== 'normalizeLineEndings')
          throw new Error();
        const property = Object.getOwnPropertyDescriptor(options, key);
        if (
          !property ||
          !('value' in property) ||
          typeof property.value !== 'boolean'
        )
          throw new Error();
        if (key === 'rejectLinks') rejectLinks = property.value;
        else normalizeLineEndings = property.value;
      }
    }
    const canonical = await realpath(target);
    if (rejectLinks && canonical !== target)
      throw new CompanyRepositoryError(
        'INVALID_PATH',
        'Use direct single-link source files for strict reads.',
        path,
      );
    if (!isContained(root, canonical)) {
      throw new CompanyRepositoryError(
        'PATH_OUTSIDE_REPOSITORY',
        'The document symlink must resolve inside the company repository.',
        path,
      );
    }
    // Nonblocking open also lets us reject named pipes without waiting for a writer.
    const file = await open(
      canonical,
      constants.O_RDONLY |
        constants.O_NONBLOCK |
        (rejectLinks ? constants.O_NOFOLLOW : 0),
    );
    try {
      const info = await file.stat();
      if (rejectLinks && info.nlink !== 1)
        throw new CompanyRepositoryError(
          'INVALID_PATH',
          'Use direct single-link source files for strict reads.',
          path,
        );
      if (!info.isFile()) {
        throw new CompanyRepositoryError(
          'NOT_REGULAR_FILE',
          'Choose a regular document file.',
          path,
        );
      }
      if (info.size > MAX_FILE_BYTES) {
        throw new CompanyRepositoryError(
          'FILE_TOO_LARGE',
          'Keep each company document at or below 1 MiB.',
          path,
        );
      }
      const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
      let size = 0;
      while (size < buffer.length) {
        const result = await file.read(
          buffer,
          size,
          buffer.length - size,
          size,
        );
        if (result.bytesRead === 0) break;
        size += result.bytesRead;
      }
      if (size > MAX_FILE_BYTES) {
        throw new CompanyRepositoryError(
          'FILE_TOO_LARGE',
          'Keep each company document at or below 1 MiB.',
          path,
        );
      }
      const source = new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: true,
      }).decode(buffer.subarray(0, size));
      return normalizeLineEndings ? source.replace(/\r\n?/g, '\n') : source;
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error instanceof CompanyRepositoryError) throw error;
    throw new CompanyRepositoryError(
      isMissing(error) ? 'FILE_NOT_FOUND' : 'FILE_READ_ERROR',
      'Cannot read the company document; check that it exists, is UTF-8, and is readable.',
      path,
    );
  }
}

async function resolveDirectory(path: string): Promise<string> {
  try {
    const canonical = await realpath(path);
    if (!(await stat(canonical)).isDirectory())
      throw new Error('not a directory');
    return canonical;
  } catch {
    throw new CompanyRepositoryError(
      'INVALID_DIRECTORY',
      'Configure an existing, accessible company directory.',
      path,
    );
  }
}

async function discover(options: CompanyRepositoryOptions): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const configured =
    options.directory ?? (options.env ?? process.env)['MZ_COMPANY_DIR'];
  if (configured !== undefined) {
    if (!configured.trim())
      throw new CompanyRepositoryError(
        'INVALID_DIRECTORY',
        'Configure a nonempty company directory.',
        configured,
      );
    return resolveDirectory(resolve(cwd, configured));
  }
  let directory = await resolveDirectory(resolve(cwd));
  while (true) {
    try {
      // lstat detects even a broken marker symlink; it must fail rather than fall back.
      await lstat(resolve(directory, 'company.yaml'));
      return directory;
    } catch (error) {
      if (!isMissing(error)) {
        throw new CompanyRepositoryError(
          'FILE_READ_ERROR',
          'Cannot inspect company.yaml; check directory permissions.',
          'company.yaml',
        );
      }
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new CompanyRepositoryError(
    'COMPANY_NOT_FOUND',
    'No company.yaml found. Configure a directory or MZ_COMPANY_DIR, or run from inside a company repository.',
    cwd,
  );
}

export async function loadCompanyRepository(
  options: CompanyRepositoryOptions = {},
): Promise<CompanyRepository> {
  const root = await discover(options);
  let source: string;
  try {
    source = await readContained(root, 'company.yaml');
  } catch (error) {
    if (
      error instanceof CompanyRepositoryError &&
      error.code === 'FILE_NOT_FOUND'
    ) {
      throw new CompanyRepositoryError(
        'CONFIG_NOT_FOUND',
        'Add a versioned company.yaml to the selected company repository.',
        'company.yaml',
      );
    }
    throw error;
  }
  const config = validateConfig(parseMetadata(source, 'company.yaml'));
  return Object.freeze({
    root,
    config,
    readYaml: async (path: string, options?: CompanyReadOptions) =>
      parseMetadata(await readContained(root, path, options), path),
    readMarkdown: async (path: string, options?: CompanyReadOptions) =>
      parseMarkdown(await readContained(root, path, options), path),
  });
}
