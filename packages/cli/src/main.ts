#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runCli } from './cli.js';

const metadata = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  version: string;
};
const result = await runCli(process.argv.slice(2), metadata.version);
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
