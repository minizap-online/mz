import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import {
  MAX_INTAKE_BYTES,
  parseInboxScope,
  requireKnownRuntimeState,
  type InboxItem,
  type InboxIntake,
  type InboxScope,
  type RuntimeState,
} from '@mz/state';
import { privateHostDirectory } from './private-host-directory.js';
export type MarkdownSource =
  | { type: 'file'; path: string }
  | { type: 'stdin'; stream: AsyncIterable<Uint8Array> };
export interface IngestMarkdownOptions {
  state: RuntimeState;
  sourceDirectory: string;
  actorId: string;
  scope?: InboxScope;
  source: MarkdownSource;
}
export interface IngestResult {
  item: InboxItem;
  intake: InboxIntake;
  summary: 'Summary pending';
  untrusted: true;
}
export type IntakeErrorCode =
  | 'INVALID_INTAKE_OPTIONS'
  | 'UNSAFE_SOURCE_DIRECTORY'
  | 'SOURCE_READ_FAILED'
  | 'INPUT_TOO_LARGE'
  | 'INVALID_MARKDOWN'
  | 'SOURCE_WRITE_FAILED'
  | 'INTAKE_COMMIT_FAILED'
  | 'INTAKE_CLEANUP_FAILED';
const messages: Record<IntakeErrorCode, string> = {
  INVALID_INTAKE_OPTIONS:
    'Use a known runtime state, private absolute source directory, actor UUID, supported scope and file/stdin source.',
  UNSAFE_SOURCE_DIRECTORY:
    'Configure a private protected host source directory outside Git repositories.',
  SOURCE_READ_FAILED:
    'The Markdown source could not be read as a regular file or byte stream; source details are withheld.',
  INPUT_TOO_LARGE: 'Keep Markdown input at or below 1 MiB.',
  INVALID_MARKDOWN: 'Supply nonempty valid UTF-8 Markdown without NUL bytes.',
  SOURCE_WRITE_FAILED:
    'Private source persistence failed; check control-plane storage and permissions.',
  INTAKE_COMMIT_FAILED:
    'Inbox creation failed and its transaction rolled back; source details are withheld.',
  INTAKE_CLEANUP_FAILED:
    'Owned source cleanup failed; reconcile private source storage through the control plane.',
};
const errorCodes = new WeakMap<object, IntakeErrorCode>();
export class IntakeError extends Error {
  readonly code: IntakeErrorCode;
  constructor(code: IntakeErrorCode) {
    const safeCode =
      typeof code === 'string' && Object.hasOwn(messages, code)
        ? code
        : 'INVALID_INTAKE_OPTIONS';
    super(messages[safeCode]);
    this.name = 'IntakeError';
    this.code = safeCode;
    errorCodes.set(this, safeCode);
  }
}
function own(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new Error();
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== null && prototype !== Object.prototype) throw new Error();
  const values: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !fields.includes(key)) throw new Error();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) throw new Error();
    values[key] = descriptor.value;
  }
  return values;
}
function absolute(value: unknown): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0'))
    throw new Error();
  return value;
}
async function info(
  path: string,
): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return null;
    throw error;
  }
}
async function sourceRoot(input: string): Promise<string> {
  try {
    const root = await privateHostDirectory(input);
    let path = root;
    while (true) {
      if (await info(join(path, '.git'))) throw new Error();
      const [head, objects, refs] = await Promise.all([
        info(join(path, 'HEAD')),
        info(join(path, 'objects')),
        info(join(path, 'refs')),
      ]);
      if (head && objects?.isDirectory() && refs?.isDirectory())
        throw new Error();
      const parent = dirname(path);
      if (parent === path) break;
      path = parent;
    }
    return root;
  } catch {
    throw new IntakeError('UNSAFE_SOURCE_DIRECTORY');
  }
}
async function inputBytes(source: MarkdownSource): Promise<Buffer> {
  try {
    let bytes: Buffer;
    if (source.type === 'file') {
      const file = await open(
        source.path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const stat = await file.stat();
        if (!stat.isFile()) throw new IntakeError('SOURCE_READ_FAILED');
        if (stat.size > MAX_INTAKE_BYTES)
          throw new IntakeError('INPUT_TOO_LARGE');
        const buffer = Buffer.alloc(MAX_INTAKE_BYTES + 1);
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
        if (size > MAX_INTAKE_BYTES) throw new IntakeError('INPUT_TOO_LARGE');
        bytes = Buffer.from(buffer.subarray(0, size));
      } finally {
        await file.close();
      }
    } else {
      let size = 0;
      const buffer = Buffer.alloc(MAX_INTAKE_BYTES);
      for await (const chunk of source.stream) {
        if (!(chunk instanceof Uint8Array))
          throw new IntakeError('SOURCE_READ_FAILED');
        if (size + chunk.byteLength > MAX_INTAKE_BYTES)
          throw new IntakeError('INPUT_TOO_LARGE');
        buffer.set(chunk, size);
        size += chunk.byteLength;
      }
      bytes = Buffer.from(buffer.subarray(0, size));
    }
    if (bytes.length === 0 || bytes.includes(0))
      throw new IntakeError('INVALID_MARKDOWN');
    try {
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new IntakeError('INVALID_MARKDOWN');
    }
    return bytes;
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null
        ? errorCodes.get(error)
        : undefined;
    throw new IntakeError(code ?? 'SOURCE_READ_FAILED');
  }
}
async function durableFile(
  path: string,
  data: Uint8Array | string,
): Promise<void> {
  const file = await open(
    path,
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
}
async function syncDirectory(path: string): Promise<void> {
  const directory = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY,
  );
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
export async function ingestMarkdown(
  input: IngestMarkdownOptions,
): Promise<IngestResult> {
  let state: RuntimeState;
  let sourceDirectory: string;
  let actorId: string;
  let scope: InboxScope;
  let source: MarkdownSource;
  try {
    const values = own(input, [
      'state',
      'sourceDirectory',
      'actorId',
      'scope',
      'source',
    ]);
    state = values['state'] as RuntimeState;
    requireKnownRuntimeState(state);
    state.getStatus();
    sourceDirectory = absolute(values['sourceDirectory']);
    actorId = values['actorId'] as string;
    if (
      typeof actorId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        actorId,
      )
    )
      throw new Error();
    scope = parseInboxScope(values['scope']);
    const fields = own(values['source'], ['type', 'path', 'stream']);
    if (fields['type'] === 'file' && !Object.hasOwn(fields, 'stream'))
      source = { type: 'file', path: absolute(fields['path']) };
    else if (
      fields['type'] === 'stdin' &&
      !Object.hasOwn(fields, 'path') &&
      fields['stream'] !== null &&
      typeof fields['stream'] === 'object'
    )
      source = {
        type: 'stdin',
        stream: fields['stream'] as AsyncIterable<Uint8Array>,
      };
    else throw new Error();
  } catch {
    throw new IntakeError('INVALID_INTAKE_OPTIONS');
  }
  const root = await sourceRoot(sourceDirectory);
  const bytes = await inputBytes(source);
  const sourceId = randomUUID();
  const id = randomUUID();
  const receivedAt = new Date().toISOString();
  const directory = join(root, sourceId);
  let owned: { dev: number | bigint; ino: number | bigint } | undefined;
  try {
    try {
      await mkdir(directory, { mode: 0o700 });
      owned = await lstat(directory);
      await durableFile(join(directory, 'content.md'), bytes);
      await durableFile(
        join(directory, 'metadata.json'),
        JSON.stringify({
          sourceId,
          inboxItemId: id,
          createdBy: actorId,
          receivedAt,
          sourceType: source.type,
          sourceBytes: bytes.length,
          scope,
          ...(source.type === 'file'
            ? { originalName: basename(source.path) }
            : {}),
        }) + '\n',
      );
      await syncDirectory(directory);
      await syncDirectory(root);
    } catch {
      throw new IntakeError('SOURCE_WRITE_FAILED');
    }
    try {
      return state.transaction((tx) => {
        const item = tx.createInboxItem({
          id,
          sourceId,
          actorId,
          receivedAt,
          intake: { sourceType: source.type, sourceBytes: bytes.length, scope },
        });
        const intake = tx.getInboxIntake(id);
        if (!intake) throw new Error();
        return {
          item,
          intake,
          summary: 'Summary pending',
          untrusted: true,
        };
      });
    } catch {
      throw new IntakeError('INTAKE_COMMIT_FAILED');
    }
  } catch (error) {
    if (owned) {
      try {
        const current = await lstat(directory);
        if (
          current.dev !== owned.dev ||
          current.ino !== owned.ino ||
          !current.isDirectory()
        )
          throw new IntakeError('INTAKE_CLEANUP_FAILED');
        await rm(directory, { recursive: true, force: true });
        await syncDirectory(root);
      } catch {
        throw new IntakeError('INTAKE_CLEANUP_FAILED');
      }
    }
    throw new IntakeError(
      (typeof error === 'object' && error !== null
        ? errorCodes.get(error)
        : undefined) ?? 'SOURCE_WRITE_FAILED',
    );
  }
}
