import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
} from 'yaml';
import {
  CompanyRepositoryError,
  type CompanyConfig,
  type Metadata,
  type MetadataValue,
} from './types.js';

function invalidMetadata(path: string): never {
  throw new CompanyRepositoryError(
    'INVALID_METADATA',
    'Use a mapping with string keys and finite JSON values; aliases, unsafe keys, and nesting beyond 32 levels are unsupported.',
    path,
  );
}

function convert(node: unknown, path: string, depth = 0): MetadataValue {
  if (depth > 32 || isAlias(node)) return invalidMetadata(path);
  if (node === null) return null;
  if (isScalar(node)) {
    const value: unknown = node.value;
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    )
      return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return invalidMetadata(path);
  }
  if (isSeq(node))
    return node.items.map((item) => convert(item, path, depth + 1));
  if (isMap(node)) {
    const result: Metadata = {};
    for (const pair of node.items) {
      if (!isScalar(pair.key) || typeof pair.key.value !== 'string')
        return invalidMetadata(path);
      const key = pair.key.value;
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        return invalidMetadata(path);
      result[key] = convert(pair.value, path, depth + 1);
    }
    return result;
  }
  return invalidMetadata(path);
}

export function parseMetadata(
  source: string,
  path: string,
  lineOffset = 0,
): Metadata {
  const lines = new LineCounter();
  try {
    const document = parseDocument(source, {
      version: '1.2',
      strict: true,
      uniqueKeys: true,
      resolveKnownTags: false,
      prettyErrors: false,
      lineCounter: lines,
      logLevel: 'error',
    });
    const problem = document.errors[0] ?? document.warnings[0];
    if (problem) {
      const position = lines.linePos(problem.pos[0]);
      throw new CompanyRepositoryError(
        'INVALID_YAML',
        'Fix YAML syntax; use one YAML 1.2 document with unique keys and supported tags.',
        path,
        {
          line: position.line + lineOffset,
          column: position.col,
        },
      );
    }
    if (document.directives?.yaml.version !== '1.2') {
      throw new CompanyRepositoryError(
        'INVALID_YAML',
        'Use YAML 1.2; older YAML versions are unsupported.',
        path,
      );
    }
    if (document.contents === null) return {};
    if (!isMap(document.contents)) return invalidMetadata(path);
    return convert(document.contents, path) as Metadata;
  } catch (error) {
    if (error instanceof CompanyRepositoryError) throw error;
    throw new CompanyRepositoryError(
      'INVALID_YAML',
      'Fix invalid or excessively complex YAML metadata.',
      path,
    );
  }
}

export function parseMarkdown(
  source: string,
  path: string,
): { metadata: Metadata; body: string } {
  const text = source.replace(/^\uFEFF/, '');
  const opening = /^---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!opening) return { metadata: {}, body: text };
  const rest = text.slice(opening[0].length);
  const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);
  if (!closing) {
    throw new CompanyRepositoryError(
      'INVALID_FRONT_MATTER',
      'Close the opening YAML front matter block with a standalone --- line.',
      path,
      { line: 1, column: 1 },
    );
  }
  return {
    metadata: parseMetadata(rest.slice(0, closing.index), path, 1),
    body: rest.slice(closing.index + closing[0].length),
  };
}

export function validateConfig(metadata: Metadata): CompanyConfig {
  const path = 'company.yaml';
  const version = metadata['schemaVersion'];
  if (
    typeof version === 'number' &&
    Number.isInteger(version) &&
    version !== 1
  ) {
    throw new CompanyRepositoryError(
      'UNSUPPORTED_SCHEMA_VERSION',
      'This loader supports schemaVersion 1. Migrate the company config using schemas/migrations before loading.',
      path,
      { field: 'schemaVersion' },
    );
  }
  if (version !== 1) {
    throw new CompanyRepositoryError(
      'INVALID_CONFIG',
      'Set schemaVersion to the integer 1.',
      path,
      { field: 'schemaVersion' },
    );
  }
  if (
    Object.keys(metadata).some(
      (key) => !['schemaVersion', 'id', 'name'].includes(key),
    )
  ) {
    throw new CompanyRepositoryError(
      'INVALID_CONFIG',
      'Remove unsupported config fields; company.yaml accepts only schemaVersion, id, and name.',
      path,
    );
  }
  const id = metadata['id'];
  const name = metadata['name'];
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(id)) {
    throw new CompanyRepositoryError(
      'INVALID_CONFIG',
      'Set id to a lowercase slug starting with a letter, up to 64 characters.',
      path,
      { field: 'id' },
    );
  }
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim() !== name ||
    [...name].length > 200
  ) {
    throw new CompanyRepositoryError(
      'INVALID_CONFIG',
      'Set name to a nonempty trimmed string, up to 200 characters.',
      path,
      { field: 'name' },
    );
  }
  return Object.freeze({ schemaVersion: 1, id, name });
}
