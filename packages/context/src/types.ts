import type { CompanyRepository, ProviderReference } from '@mz/core';
export interface ContextOptions {
  company: CompanyRepository;
  role: string;
  project?: string;
  task: string;
  maxBytes?: number;
}
export interface ContextSource {
  path: string;
  sha256: string;
  bytes: number;
}
export interface ContextBundle {
  schemaVersion: 1;
  selection: {
    company: string;
    role: string;
    project: string | null;
    task: string;
  };
  work: ProviderReference | null;
  sources: ContextSource[];
  text: string;
  textBytes: number;
}
export type ContextErrorCode =
  | 'INVALID_CONTEXT_OPTIONS'
  | 'CONTEXT_SOURCE_FAILED'
  | 'CONTEXT_SCOPE_VIOLATION'
  | 'CONTEXT_BUDGET_EXCEEDED'
  | 'CONTEXT_SECRET_DETECTED';
const messages: Record<ContextErrorCode, string> = {
  INVALID_CONTEXT_OPTIONS:
    'Supply a company repository, assigned role/task slugs, optional project and a 1024–1048576 byte context budget.',
  CONTEXT_SOURCE_FAILED:
    'Required curated context could not be captured safely; check company source files and metadata.',
  CONTEXT_SCOPE_VIOLATION:
    'Selected identities or declared source references do not match the assigned context scope.',
  CONTEXT_BUDGET_EXCEEDED:
    'Context exceeds its byte, document or declared-reference budget; curate the selected sources or choose an explicit bounded budget.',
  CONTEXT_SECRET_DETECTED:
    'Context contains an obvious credential value or unsafe credential metadata; replace values with symbolic references before compiling.',
};
const codes = new WeakMap<object, ContextErrorCode>();
export class ContextError extends Error {
  readonly code: ContextErrorCode;
  constructor(code: ContextErrorCode) {
    const safeCode =
      typeof code === 'string' && Object.hasOwn(messages, code)
        ? code
        : 'INVALID_CONTEXT_OPTIONS';
    super(messages[safeCode]);
    this.name = 'ContextError';
    this.code = safeCode;
    codes.set(this, safeCode);
  }
}
export function contextFailure(
  error: unknown,
  fallback: ContextErrorCode,
): ContextError {
  return new ContextError(
    (typeof error === 'object' && error !== null
      ? codes.get(error)
      : undefined) ?? fallback,
  );
}
