import { createHash } from 'node:crypto';
import {
  CompanyRepositoryError,
  readStewardSnapshot,
  type CompanyRepository,
  type StewardSnapshot,
} from '@mz/core';
import { normalize, guard } from './compiler.js';
import { ContextError, contextFailure } from './types.js';
export interface StewardStatusOptions {
  company: CompanyRepository;
  project?: string;
  runtimePath?: string;
  /** Narrow company worker requests; omit project inventory and project runtime data. */
  companyOnly?: boolean;
}
export interface StewardStatus {
  schemaVersion: 1;
  company: string;
  scope: string;
  curated: {
    sources: { path: string; sha256: string; value: unknown }[];
    missing: string[];
    inventory: {
      availability: 'available' | 'unavailable';
      projects: string[];
    };
  };
  runtime:
    | { availability: 'available'; facts: StewardSnapshot }
    | { availability: 'unavailable' };
  provider: { availability: 'unavailable'; reason: string };
}
export async function getStewardStatus(
  options: StewardStatusOptions,
): Promise<StewardStatus> {
  try {
    const { company, project, runtimePath, companyOnly = false } = options;
    if (project !== undefined && !/^[a-z][a-z0-9-]{0,63}$/.test(project))
      throw new ContextError('INVALID_CONTEXT_OPTIONS');
    if (
      typeof companyOnly !== 'boolean' ||
      (companyOnly && project !== undefined)
    )
      throw new ContextError('INVALID_CONTEXT_OPTIONS');
    const sources: StewardStatus['curated']['sources'] = [];
    const missing: string[] = [];
    let bytes = 0;
    const capture = async (path: string): Promise<unknown> => {
      try {
        const read = { rejectLinks: true, normalizeLineEndings: true };
        const value = normalize(
          path.endsWith('.yaml')
            ? await company.readYaml(path, read)
            : await company.readMarkdown(path, read),
        );
        guard(value);
        const serialized = JSON.stringify(value);
        bytes += Buffer.byteLength(serialized) + Buffer.byteLength(path) + 128;
        if (bytes > 65536) throw new ContextError('CONTEXT_BUDGET_EXCEEDED');
        sources.push({
          path,
          sha256: createHash('sha256').update(serialized).digest('hex'),
          value,
        });
        return value;
      } catch (error) {
        if (
          error instanceof CompanyRepositoryError &&
          error.code === 'FILE_NOT_FOUND'
        ) {
          missing.push(path);
          return undefined;
        }
        throw error;
      }
    };
    const inventory: StewardStatus['curated']['inventory'] = {
      availability: 'unavailable',
      projects: [],
    };
    const projectSources = async (id: string): Promise<void> => {
      const config = await capture(`projects/${id}/project.yaml`);
      if (
        config !== undefined &&
        (config as Record<string, unknown>)['project'] !== id
      )
        throw new ContextError('CONTEXT_SCOPE_VIOLATION');
      await capture(`projects/${id}/STATUS.md`);
      await capture(`projects/${id}/DECISIONS.md`);
    };
    if (project !== undefined) await projectSources(project);
    else {
      await capture('STATUS.md');
      if (!companyOnly) {
        const index = await capture('projects/index.yaml');
        if (index !== undefined) {
          const data = index as Record<string, unknown>;
          if (
            data['schemaVersion'] !== 1 ||
            Object.keys(data).some(
              (key) => !['schemaVersion', 'projects'].includes(key),
            ) ||
            !Array.isArray(data['projects']) ||
            data['projects'].length > 64 ||
            data['projects'].some(
              (id: unknown) =>
                typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(id),
            ) ||
            new Set(data['projects']).size !== data['projects'].length
          )
            throw new ContextError('CONTEXT_SCOPE_VIOLATION');
          inventory.availability = 'available';
          inventory.projects = data['projects'] as string[];
          for (const id of inventory.projects) await projectSources(id);
        }
      }
    }
    let runtime: StewardStatus['runtime'] = { availability: 'unavailable' };
    if (runtimePath !== undefined) {
      try {
        runtime = {
          availability: 'available',
          facts: readStewardSnapshot({
            path: runtimePath,
            ...(project !== undefined
              ? { scope: `project:${project}` as const }
              : companyOnly
                ? { scope: 'company' as const }
                : {}),
          }),
        };
      } catch {
        /* A read failure never initializes or upgrades state. */
      }
    }
    const result: StewardStatus = {
      schemaVersion: 1,
      company: company.config.id,
      scope: project === undefined ? 'company' : `project:${project}`,
      curated: { sources, missing, inventory },
      runtime,
      provider: {
        availability: 'unavailable',
        reason:
          'Live provider work state is not connected; curated status is not authoritative provider state.',
      },
    };
    guard(normalize(result));
    if (Buffer.byteLength(JSON.stringify(result)) > 98304)
      throw new ContextError('CONTEXT_BUDGET_EXCEEDED');
    return result;
  } catch (error) {
    throw contextFailure(error, 'CONTEXT_SOURCE_FAILED');
  }
}
