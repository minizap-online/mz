export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const help = `MZ — organization toolbox (bootstrap)

Usage: mz [--help | --version]

Options:
  -h, --help     Show this help (also: mz help)
  -v, --version  Show the installed version

Only help and version are available in this bootstrap.
`;

export function runCli(args: readonly string[], version: string): CliResult {
  if (
    args.length === 0 ||
    (args.length === 1 && ['help', '--help', '-h'].includes(args[0]!))
  ) {
    return { stdout: help, stderr: '', exitCode: 0 };
  }
  if (args.length === 1 && ['--version', '-v'].includes(args[0]!)) {
    return { stdout: `${version}\n`, stderr: '', exitCode: 0 };
  }
  return {
    stdout: '',
    stderr: 'Unsupported command or arguments. Run mz --help.\n',
    exitCode: 2,
  };
}
