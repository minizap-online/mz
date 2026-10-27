import { createHash } from 'node:crypto';
import {
  containsObviousCredential,
  parseSecretRef,
  type CompanyRepository,
  type ProviderReference,
} from '@mz/core';
import {
  ContextError,
  contextFailure,
  type ContextBundle,
  type ContextOptions,
  type ContextSource,
} from './types.js';
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface Capture {
  source: ContextSource;
  value: Json;
}
function own(
  input: unknown,
  fields?: readonly string[],
): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new Error();
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new Error();
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || (fields && !fields.includes(key)))
      throw new Error();
    const property = Object.getOwnPropertyDescriptor(input, key);
    if (!property || !('value' in property)) throw new Error();
    result[key] = property.value;
  }
  return result;
}
function unsupportedControls(value: string, multiline: boolean): boolean {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (
      (code < 32 && !(multiline && (code === 9 || code === 10))) ||
      (code >= 127 && code <= 159)
    )
      return true;
  }
  return false;
}
export function normalize(value: unknown, depth = 0): Json {
  if (depth > 32) throw new Error();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/\r\n?/g, '\n');
    if (unsupportedControls(normalized, true)) throw new Error();
    return normalized;
  }
  if (Array.isArray(value)) {
    const items: Json[] = [];
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !('value' in descriptor)) throw new Error();
      items.push(normalize(descriptor.value, depth + 1));
    }
    return items;
  }
  const data = own(value);
  const result: Record<string, Json> = Object.create(null);
  for (const key of Object.keys(data).sort()) {
    if (unsupportedControls(key, false)) throw new Error();
    if (containsObviousCredential(key))
      throw new ContextError('CONTEXT_SECRET_DETECTED');
    result[key] = normalize(data[key], depth + 1);
  }
  return result;
}
export function guard(value: Json, sensitive = false): void {
  if (typeof value === 'string') {
    if (containsObviousCredential(value))
      throw new ContextError('CONTEXT_SECRET_DETECTED');
    if (sensitive) {
      try {
        parseSecretRef(value);
      } catch {
        throw new ContextError('CONTEXT_SECRET_DETECTED');
      }
    }
    return;
  }
  if (value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) guard(item, sensitive);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value))
      guard(
        item,
        sensitive ||
          /^(?:secrets?|passwords?|tokens?|credentials?|api[_-]?key|private[_-]?key)(?:[_-]?refs?)?$/i.test(
            key,
          ),
      );
    return;
  }
  if (sensitive) throw new ContextError('CONTEXT_SECRET_DETECTED');
}
function slug(
  value: unknown,
  code: 'INVALID_CONTEXT_OPTIONS' | 'CONTEXT_SCOPE_VIOLATION',
): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value))
    throw new ContextError(code);
  return value;
}
function references(metadata: Record<string, unknown>, name: string): string[] {
  const value = metadata[name];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ContextError('CONTEXT_SCOPE_VIOLATION');
  if (value.length > 32) throw new ContextError('CONTEXT_BUDGET_EXCEEDED');
  return value.map((item) => slug(item, 'CONTEXT_SCOPE_VIOLATION'));
}
function workReference(value: unknown): ProviderReference | null {
  if (value === undefined) return null;
  const fields = own(value, ['provider', 'kind', 'externalId', 'url']);
  const provider = slug(fields['provider'], 'CONTEXT_SCOPE_VIOLATION');
  const kind = slug(fields['kind'], 'CONTEXT_SCOPE_VIOLATION');
  const externalId = fields['externalId'];
  if (
    typeof externalId !== 'string' ||
    externalId.trim() !== externalId ||
    externalId.length < 1 ||
    externalId.length > 256 ||
    unsupportedControls(externalId, false)
  )
    throw new ContextError('CONTEXT_SCOPE_VIOLATION');
  let url: string | undefined;
  if (Object.hasOwn(fields, 'url')) {
    if (
      typeof fields['url'] !== 'string' ||
      fields['url'].length > 2048 ||
      fields['url'].trim() !== fields['url'] ||
      unsupportedControls(fields['url'], false)
    )
      throw new ContextError('CONTEXT_SCOPE_VIOLATION');
    const parsed = new URL(fields['url']);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
      throw new ContextError('CONTEXT_SCOPE_VIOLATION');
    url = fields['url'];
  }
  return { provider, kind, externalId, ...(url === undefined ? {} : { url }) };
}
export async function compileContext(
  input: ContextOptions,
): Promise<ContextBundle> {
  let company: CompanyRepository;
  let role: string;
  let project: string | null;
  let task: string;
  let maxBytes: number;
  try {
    const values = own(input, [
      'company',
      'role',
      'project',
      'task',
      'maxBytes',
    ]);
    const port = own(values['company']);
    if (
      typeof port['readYaml'] !== 'function' ||
      typeof port['readMarkdown'] !== 'function' ||
      !port['config']
    )
      throw new Error();
    company = values['company'] as CompanyRepository;
    role = slug(values['role'], 'INVALID_CONTEXT_OPTIONS');
    task = slug(values['task'], 'INVALID_CONTEXT_OPTIONS');
    project =
      values['project'] === undefined
        ? null
        : slug(values['project'], 'INVALID_CONTEXT_OPTIONS');
    const budget =
      values['maxBytes'] === undefined ? 65536 : values['maxBytes'];
    if (
      typeof budget !== 'number' ||
      !Number.isSafeInteger(budget) ||
      budget < 1024 ||
      budget > 1048576
    )
      throw new Error();
    maxBytes = budget;
  } catch (error) {
    throw contextFailure(error, 'INVALID_CONTEXT_OPTIONS');
  }
  try {
    const cache = new Map<string, Capture>();
    let capturedBytes = 0;
    const capture = (path: string, value: unknown): Capture => {
      const existing = cache.get(path);
      if (existing) return existing;
      if (cache.size >= 64) throw new ContextError('CONTEXT_BUDGET_EXCEEDED');
      const normalized = normalize(value);
      guard(normalized);
      const serialized = JSON.stringify(normalized);
      const bytes = Buffer.byteLength(serialized);
      capturedBytes += bytes;
      if (capturedBytes > maxBytes)
        throw new ContextError('CONTEXT_BUDGET_EXCEEDED');
      const item = {
        source: {
          path,
          sha256: createHash('sha256').update(serialized).digest('hex'),
          bytes,
        },
        value: normalized,
      };
      cache.set(path, item);
      return item;
    };
    const markdown = async (path: string): Promise<Capture> => {
      const existing = cache.get(path);
      if (existing) return existing;
      const doc = own(
        await company.readMarkdown(path, {
          rejectLinks: true,
          normalizeLineEndings: true,
        }),
        ['metadata', 'body'],
      );
      if (typeof doc['body'] !== 'string') throw new Error();
      own(doc['metadata']);
      return capture(path, {
        kind: 'markdown',
        metadata: doc['metadata'],
        body: doc['body'],
      });
    };
    const yaml = async (path: string): Promise<Capture> => {
      const existing = cache.get(path);
      if (existing) return existing;
      const value = await company.readYaml(path, {
        rejectLinks: true,
        normalizeLineEndings: true,
      });
      own(value);
      return capture(path, { kind: 'yaml', value });
    };
    const metadata = (doc: Capture): Record<string, unknown> => {
      const value = doc.value as Record<string, Json>;
      return own(
        value['kind'] === 'markdown' ? value['metadata'] : value['value'],
      );
    };
    const config = own(company.config, ['schemaVersion', 'id', 'name']);
    const companyId = slug(config['id'], 'CONTEXT_SCOPE_VIOLATION');
    const companyDoc = await yaml('company.yaml');
    if (
      JSON.stringify(normalize(config)) !==
      JSON.stringify((companyDoc.value as Record<string, Json>)['value'])
    )
      throw new ContextError('CONTEXT_SCOPE_VIOLATION');
    const roleDoc = await markdown(`roles/${role}.md`);
    const projectDoc =
      project === null ? null : await yaml(`projects/${project}/project.yaml`);
    const taskPath =
      project === null
        ? `tasks/${task}.md`
        : `projects/${project}/tasks/${task}.md`;
    const taskDoc = await markdown(taskPath);
    const roleData = metadata(roleDoc);
    const projectData = projectDoc ? metadata(projectDoc) : {};
    const taskData = metadata(taskDoc);
    if (
      (roleData['role'] !== undefined && roleData['role'] !== role) ||
      (project !== null && projectData['project'] !== project) ||
      (taskData['role'] !== undefined && taskData['role'] !== role) ||
      (taskData['project'] !== undefined && taskData['project'] !== project)
    )
      throw new ContextError('CONTEXT_SCOPE_VIOLATION');
    const refs = (name: string): string[] =>
      [
        ...new Set([
          ...(name === 'policies' ? ['security-baseline'] : []),
          ...references(roleData, name),
          ...references(projectData, name),
          ...references(taskData, name),
        ]),
      ].sort();
    // Compute/validate the full selected reference graph before reading referenced material.
    const processes = refs('processes');
    const policies = refs('policies');
    const decisions = refs('decisions');
    const selectedPaths = new Set([
      'company.yaml',
      'COMPANY.md',
      'AUTHORITY.md',
      `roles/${role}.md`,
      taskPath,
      ...processes.map((id) => `processes/${id}.md`),
      ...policies.map((id) => `policies/${id}.md`),
      ...decisions.map((id) => `decisions/${id}.md`),
      ...(project === null
        ? []
        : [
            `projects/${project}/project.yaml`,
            ...['PROJECT', 'ARCHITECTURE', 'STATUS', 'DECISIONS'].map(
              (name) => `projects/${project}/${name}.md`,
            ),
          ]),
    ]);
    if (selectedPaths.size > 64)
      throw new ContextError('CONTEXT_BUDGET_EXCEEDED');
    const documents: Capture[] = [
      companyDoc,
      await markdown('COMPANY.md'),
      await markdown('AUTHORITY.md'),
      roleDoc,
    ];
    for (const id of processes)
      documents.push(await markdown(`processes/${id}.md`));
    if (projectDoc) {
      documents.push(projectDoc);
      for (const name of ['PROJECT', 'ARCHITECTURE', 'STATUS', 'DECISIONS'])
        documents.push(await markdown(`projects/${project}/${name}.md`));
    }
    for (const id of policies)
      documents.push(await markdown(`policies/${id}.md`));
    for (const id of decisions)
      documents.push(await markdown(`decisions/${id}.md`));
    documents.push(taskDoc);
    const work = workReference(taskData['work']);
    const text = [
      `# MZ context\nCompany: ${companyId}\nRole: ${role}\nProject: ${project ?? '(company)'}\nTask: ${task}\n\nInformational context only. Execution requires separately assigned capabilities.\nCurated status does not replace authoritative provider work state.\n`,
      ...documents.map((doc) => {
        const value = doc.value as Record<string, Json>;
        const contents =
          value['kind'] === 'markdown'
            ? `Metadata: ${JSON.stringify(value['metadata'])}\n\n${value['body'] as string}`
            : JSON.stringify(value['value']);
        return `\n## Source: ${doc.source.path}\nNormalized SHA256: ${doc.source.sha256}\n\n${contents}\n`;
      }),
    ].join('');
    const bundle: ContextBundle = {
      schemaVersion: 1,
      selection: { company: companyId, role, project, task },
      work,
      sources: documents.map((doc) => doc.source),
      text,
      textBytes: Buffer.byteLength(text),
    };
    if (
      bundle.textBytes > maxBytes ||
      Buffer.byteLength(JSON.stringify(bundle) + '\n') > maxBytes
    )
      throw new ContextError('CONTEXT_BUDGET_EXCEEDED');
    return bundle;
  } catch (error) {
    throw contextFailure(error, 'CONTEXT_SOURCE_FAILED');
  }
}
