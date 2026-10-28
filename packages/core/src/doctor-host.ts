import { execFile } from 'node:child_process';
export interface DoctorCommandResult {
  ok: boolean;
  stdout: string;
}
export interface DoctorHost {
  nodeVersion: string;
  probeCommand(
    command: string,
    args: readonly string[],
  ): Promise<DoctorCommandResult>;
}
/** Trusted host seam for tests; reports never contain captured command output. */
export function createDoctorHost(
  env: NodeJS.ProcessEnv = process.env,
): DoctorHost {
  return {
    nodeVersion: process.version,
    probeCommand: (command, args) =>
      new Promise((resolve) => {
        const child = execFile(
          command,
          [...args],
          {
            timeout: args.includes('api') ? 10000 : 5000,
            killSignal: 'SIGKILL',
            maxBuffer: 4096,
            encoding: 'utf8',
            windowsHide: true,
            env: {
              ...env,
              GH_PROMPT_DISABLED: '1',
              GIT_TERMINAL_PROMPT: '0',
            },
          },
          (error, stdout) =>
            resolve({ ok: !error, stdout: error ? '' : stdout }),
        );
        child.stdin?.end();
      }),
  };
}
export const defaultDoctorHost: DoctorHost = createDoctorHost();
