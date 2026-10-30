import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  installationPaths,
  readLocalInstallation,
  loadCompanyRepository,
  provisionProject,
} from '@mz/core';
import { loadAppConnection } from './github-app-store.js';
import { runProjectCheckout } from './project-checkout.js';
import type { AppRequest } from '@mz/github';
import type { CliResult } from './cli.js';
const help = `Usage: mz project create|attach NAME --approved [--public] [--action UUID]\n       mz project checkout NAME DIRECTORY [--delivery] [--related NAME] [--json]\n\nCreate/attach uses the configured organization-owned GitHub App; default private.\nCheckout prepares local Git credentials, .mz/activate and create-missing-only AGENTS.md.\nActivate the project environment before starting Codex or gh. No token values are stored.\n--delivery requires expanded installed grants; run mz github permissions for upgrade details.\nNo deployment or spending. Existing project instructions are preserved.\nRepeated provisioning action IDs resume local publication; uncertain creates need explicit attach.\nThis command trusts its host operator; --approved is not an untrusted-worker authorization mechanism.\n`;
export async function runProjectCli(
  args: readonly string[],
  host: { env?: NodeJS.ProcessEnv; request?: AppRequest } = {},
): Promise<CliResult> {
  if (args[0] === 'checkout') return runProjectCheckout(args.slice(1), host);
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!))
    return { stdout: help, stderr: '', exitCode: 0 };
  let operation: 'create' | 'attach',
    name: string,
    approved = false,
    isPrivate = true,
    action: string | undefined;
  try {
    if (
      !['create', 'attach'].includes(args[0] ?? '') ||
      !args[1] ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(args[1])
    )
      throw new Error();
    operation = args[0] as 'create' | 'attach';
    name = args[1];
    const seen = new Set<string>();
    for (let i = 2; i < args.length; i++) {
      const flag = args[i]!;
      if (seen.has(flag)) throw new Error();
      seen.add(flag);
      if (flag === '--approved') approved = true;
      else if (flag === '--public') isPrivate = false;
      else if (flag === '--action') {
        action = args[++i];
        if (!action) throw new Error();
      } else throw new Error();
    }
    if (!approved) throw new Error();
  } catch {
    return {
      stdout: '',
      stderr:
        'Supply a concrete owner-approved request. Run mz project --help.\n',
      exitCode: 2,
    };
  }
  const env = host.env ?? process.env;
  try {
    const settings = await readLocalInstallation({
      configFile: installationPaths(env).configFile,
    });
    if (!settings) throw new Error();
    await loadCompanyRepository({
      directory: settings.companyDirectory,
      env: {},
    });
    const saved = await loadAppConnection({
      companyDirectory: settings.companyDirectory,
      env,
      ...(host.request ? { request: host.request } : {}),
    });
    if (!saved) throw new Error();
    const hash = createHash('sha256')
      .update(saved.connection.organizationId + '/' + operation + '/' + name)
      .digest('hex');
    const stable =
      hash.slice(0, 8) +
      '-' +
      hash.slice(8, 12) +
      '-4' +
      hash.slice(13, 16) +
      '-8' +
      hash.slice(17, 20) +
      '-' +
      hash.slice(20, 32);
    const result = await provisionProject({
      directory: join(settings.sourceDirectory, 'provisioning'),
      companyDirectory: settings.companyDirectory,
      approved,
      intent: {
        schemaVersion: 1,
        actionId: action ?? stable,
        actorId: settings.actorId,
        organizationId: saved.connection.organizationId,
        organization: saved.connection.organization,
        projectId: name,
        repositoryName: name,
        private: isPrivate,
        operation,
      },
      provider: saved.app,
    });
    return {
      stdout:
        JSON.stringify({
          project: name,
          repository: saved.connection.organization + '/' + name,
          actionId: action ?? stable,
          ...result,
          development: 'pending',
          deployment: 'pending',
        }) + '\n',
      stderr: '',
      exitCode: 0,
    };
  } catch {
    return {
      stdout: '',
      stderr:
        'Project provisioning is incomplete. Check mz github status, owner authorization and repository conflicts. An uncertain create must be reconciled with an explicitly approved attach; existing resources and knowledge were preserved.\n',
      exitCode: 1,
    };
  }
}
