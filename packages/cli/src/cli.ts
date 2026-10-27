import { runDoctorCli } from './doctor.js';
export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const help = `MZ — organization toolbox

Usage: mz [--help | --version]
       mz doctor [options]

Options:
  -h, --help     Show this help (also: mz help)
  -v, --version  Show the installed version

Commands:
  doctor        Inspect environment and existing state (mz doctor --help)
`;

export async function runCli(
  args: readonly string[],
  version: string,
): Promise<CliResult> {
  if (args[0] === 'doctor') return runDoctorCli(args.slice(1));
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
