import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
/** Credential provisioning UI, never a conversational/model prompt. No echo or history persistence. */
export async function hiddenSecret(label: string): Promise<Buffer> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error();
  const muted = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const terminal = createInterface({
    input: process.stdin,
    output: muted,
    terminal: true,
    historySize: 0,
  });
  process.stdout.write(label + ': ');
  let inputBytes = 0;
  const limit = (value: Buffer | string): void => {
    inputBytes +=
      typeof value === 'string' ? Buffer.byteLength(value) : value.length;
    if (inputBytes > 8192) terminal.close();
  };
  process.stdin.on('data', limit);
  try {
    const interrupted = new Promise<never>((_, reject) => {
      terminal.once('SIGINT', () => reject(new Error()));
      terminal.once('close', () => reject(new Error()));
    });
    const answer = await Promise.race([terminal.question(''), interrupted]);
    if (Buffer.byteLength(answer) > 4096) throw new Error();
    return Buffer.from(answer.trim(), 'utf8');
  } finally {
    process.stdin.removeListener('data', limit);
    terminal.close();
    muted.end();
    process.stdout.write('\n');
  }
}
