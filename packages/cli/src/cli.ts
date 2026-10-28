import { runProjectCli } from './project.js';
import { runGitHubAppCli } from './github-app-transport.js';
import { runOwnerConversation, isOwnerAsk } from './conversation.js';
import { runInitCli } from './init.js';
import { withInstallationDefaults } from './installation-defaults.js';
import { runStewardCli } from './steward.js';
import { runContextCli } from './context.js';
import { runInboxCli } from './inbox.js';
import { runIngestCli } from './ingest.js';
import { runDoctorCli } from './doctor.js';
export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const help = `MZ — organization toolbox

Usage: mz [--help | --version]
       mz init [options]
       mz guide [options]
       mz ask [--project ID] [QUESTION...]
       mz project create|attach NAME --approved
       mz github status
       mz doctor [options]
       mz ingest FILE [options]
       mz inbox [list | inspect | history | triage] [options]
       mz context --role ROLE --task TASK [options]
       mz status [options]
       mz ask FILE --role ROLE --task TASK [options]

Options:
  -h, --help     Show this help (also: mz help)
  -v, --version  Show the installed version

Commands:
  init          Prepare the company shell and local settings (mz init --help)
  guide         Guided company and first-project context (mz guide --help)
  doctor        Inspect environment and existing state (mz doctor --help)
  ingest        Import private Markdown from a file or stdin (mz ingest --help)
  inbox         List, inspect and triage private intake (mz inbox --help)
  context       Compile bounded relevant company context (mz context --help)
  status        Report curated evidence and runtime facts (mz status --help)
  ask           Open the owner steward conversation (mz ask --help; --api-help for API)
`;

export async function runCli(
  args: readonly string[],
  version: string,
): Promise<CliResult> {
  if (args.length === 2 && args[0] === 'ask' && args[1] === '--api-help')
    return runStewardCli('ask', ['--help']);
  if (args[0] === 'project') return runProjectCli(args.slice(1));
  if (args[0] === 'github') return runGitHubAppCli(args.slice(1));
  if (args[0] === 'init') return runInitCli(args.slice(1));
  if (args[0] === 'guide') return runOwnerConversation('guide', args.slice(1));
  if (args[0] === 'ask' && isOwnerAsk(args.slice(1)))
    return runOwnerConversation('ask', args.slice(1));
  try {
    args = await withInstallationDefaults(args);
  } catch {
    return {
      stdout: '',
      stderr:
        'Saved MZ settings could not be read safely. Check the selected local configuration; run mz init --help.\n',
      exitCode: 1,
    };
  }
  if (args[0] === 'status' || args[0] === 'ask')
    return runStewardCli(args[0], args.slice(1));
  if (args[0] === 'context') return runContextCli(args.slice(1));
  if (args[0] === 'inbox') return runInboxCli(args.slice(1));
  if (args[0] === 'ingest') return runIngestCli(args.slice(1));
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
