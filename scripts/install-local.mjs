import {
  lstat,
  mkdir,
  readFile,
  link,
  unlink,
  writeFile,
  realpath,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
try {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--prefix'))
    throw new Error();
  const prefix = args[1] ?? join(homedir(), '.local');
  if (!isAbsolute(prefix) || prefix.includes('\0')) throw new Error();
  const checkout = await realpath(
    fileURLToPath(new URL('..', import.meta.url)),
  );
  const entry = join(checkout, 'packages/cli/dist/main.js');
  if (!(await lstat(entry)).isFile()) throw new Error();
  const target = join(prefix, 'bin/mz');
  const content =
    '#!/bin/sh\n# Managed MZ development launcher; keep the built checkout available.\nexec ' +
    quote(process.execPath) +
    ' ' +
    quote(entry) +
    ' "$@"\n';
  await mkdir(dirname(target), { recursive: true, mode: 0o755 });
  try {
    const info = await lstat(target);
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      (await readFile(target, 'utf8')) !== content
    )
      throw new Error();
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
    const temporary = join(dirname(target), '.mz-' + randomUUID());
    try {
      await writeFile(temporary, content, { flag: 'wx', mode: 0o755 });
      await link(temporary, target);
    } finally {
      await unlink(temporary);
    }
  }
  process.stdout.write(
    'Installed MZ development launcher at ' +
      target +
      '\nKeep ' +
      checkout +
      ' available and rebuild after updates. Next: mz init\n',
  );
} catch {
  process.stderr.write(
    'Local installation failed. Build MZ first and select an absolute writable prefix; an unrelated existing mz command will not be overwritten.\n',
  );
  process.exitCode = 1;
}
