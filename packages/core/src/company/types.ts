export type MetadataValue =
  string | number | boolean | null | MetadataValue[] | Metadata;
export interface Metadata {
  [key: string]: MetadataValue;
}

export interface CompanyConfig {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
}

export interface CompanyRepositoryOptions {
  directory?: string;
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
}

export interface CompanyRepository {
  readonly root: string;
  readonly config: CompanyConfig;
  readYaml(path: string): Promise<Metadata>;
  readMarkdown(path: string): Promise<{ metadata: Metadata; body: string }>;
}

export type CompanyRepositoryErrorCode =
  | 'COMPANY_NOT_FOUND'
  | 'INVALID_DIRECTORY'
  | 'CONFIG_NOT_FOUND'
  | 'FILE_NOT_FOUND'
  | 'FILE_READ_ERROR'
  | 'INVALID_PATH'
  | 'PATH_OUTSIDE_REPOSITORY'
  | 'NOT_REGULAR_FILE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_YAML'
  | 'INVALID_METADATA'
  | 'INVALID_CONFIG'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'INVALID_FRONT_MATTER';

export class CompanyRepositoryError extends Error {
  readonly code: CompanyRepositoryErrorCode;
  readonly path: string;
  readonly field?: string;
  readonly line?: number;
  readonly column?: number;

  constructor(
    code: CompanyRepositoryErrorCode,
    message: string,
    path: string,
    details: { field?: string; line?: number; column?: number } = {},
  ) {
    super(message);
    this.name = 'CompanyRepositoryError';
    this.code = code;
    this.path = path;
    Object.assign(this, details);
  }
}
