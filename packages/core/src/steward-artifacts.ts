import { constants } from 'node:fs';
import { lstat, mkdir, open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { privateHostDirectory } from './private-host-directory.js';
import {
  StewardError,
  stewardText,
  validateStewardResponse,
  type StewardRequest,
  type StewardResponse,
} from './steward.js';
export interface StewardArtifacts {
  create(sourceId: string, request: StewardRequest): Promise<void>;
  complete(sourceId: string, response: StewardResponse): Promise<void>;
  readResponse(sourceId: string): Promise<StewardResponse>;
}
export function stewardUuid(input: unknown): string {
  if (
    typeof input !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      input,
    )
  )
    throw new StewardError();
  return input;
}
export async function stewardSync(path: string): Promise<void> {
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}
export async function stewardWrite(path: string, text: string): Promise<void> {
  const file = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(text, 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }
}
export async function openStewardArtifacts(options: {
  directory: string;
}): Promise<StewardArtifacts> {
  try {
    const root = await privateHostDirectory(options.directory);
    let parent = root;
    while (true) {
      for (const marker of ['.git', 'HEAD']) {
        try {
          await lstat(join(parent, marker));
          throw new StewardError();
        } catch (error) {
          if (!(
            error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT'
          ))
            throw error;
        }
      }
      const next = dirname(parent);
      if (next === parent) break;
      parent = next;
    }
    const job = async (id: string): Promise<string> => {
      const path = join(root, stewardUuid(id));
      if (
        (await privateHostDirectory(root)) !== root ||
        (await privateHostDirectory(path)) !== path
      )
        throw new StewardError();
      return path;
    };
    return Object.freeze({
      async create(id: string, request: StewardRequest): Promise<void> {
        try {
          const text = stewardText(JSON.stringify(request), 131072);
          if ((await privateHostDirectory(root)) !== root)
            throw new StewardError();
          const path = join(root, stewardUuid(id));
          await mkdir(path, { mode: 0o700 });
          await stewardWrite(join(path, 'request.json'), text + '\n');
          await stewardSync(path);
          await stewardSync(root);
        } catch {
          throw new StewardError();
        }
      },
      async complete(id: string, response: StewardResponse): Promise<void> {
        try {
          const path = await job(id);
          await stewardWrite(
            join(path, 'response.json'),
            JSON.stringify(validateStewardResponse(response)) + '\n',
          );
          await stewardSync(path);
          await stewardSync(root);
        } catch {
          throw new StewardError();
        }
      },
      async readResponse(id: string): Promise<StewardResponse> {
        try {
          const path = await job(id);
          const file = await open(
            join(path, 'response.json'),
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
          );
          try {
            const info = await file.stat();
            if (
              !info.isFile() ||
              info.nlink !== 1 ||
              (info.mode & 0o077) !== 0 ||
              (info.uid !== 0 && info.uid !== process.geteuid?.()) ||
              info.size > 32769
            )
              throw new StewardError();
            const buffer = Buffer.alloc(32770);
            let size = 0;
            while (size < buffer.length) {
              const result = await file.read(
                buffer,
                size,
                buffer.length - size,
                size,
              );
              if (!result.bytesRead) break;
              size += result.bytesRead;
            }
            if (size > 32769) throw new StewardError();
            const text = new TextDecoder('utf-8', { fatal: true }).decode(
              buffer.subarray(0, size),
            );
            return validateStewardResponse(JSON.parse(text));
          } finally {
            await file.close();
          }
        } catch {
          throw new StewardError();
        }
      },
    });
  } catch {
    throw new StewardError();
  }
}
