declare const secretRefBrand: unique symbol;
export type SecretRef = string & { readonly [secretRefBrand]: true };
export interface SecretValue {
  revealText(): string;
  toJSON(): never;
}
export interface SecretHandle {
  readonly ref: SecretRef;
  use<T>(action: (value: SecretValue) => T | PromiseLike<T>): Promise<T>;
  dispose(): void;
  toJSON(): never;
}
export interface SecretProvider {
  resolve(ref: SecretRef): Promise<SecretHandle>;
}
export interface HostFileSecretProviderOptions {
  directory: string;
  bindings: Readonly<Record<string, string>>;
}
export type RedactedValue =
  | string
  | number
  | boolean
  | null
  | RedactedValue[]
  | { [key: string]: RedactedValue };
export type SecretErrorCode =
  | 'INVALID_SECRET_REF'
  | 'INVALID_SECRET_CONFIGURATION'
  | 'UNSUPPORTED_SECRET_HOST'
  | 'UNKNOWN_SECRET_REF'
  | 'UNSAFE_SECRET_DIRECTORY'
  | 'UNSAFE_SECRET_FILE'
  | 'SECRET_FILE_UNAVAILABLE'
  | 'INVALID_SECRET_FILE'
  | 'INVALID_SECRET_HANDLE'
  | 'SECRET_HANDLE_DISPOSED'
  | 'SECRET_HANDLE_ACTIVE'
  | 'SECRET_VALUE_EXPIRED'
  | 'SECRET_SERIALIZATION_FORBIDDEN'
  | 'SECRET_ACTION_FAILED'
  | 'INVALID_SECRET_ACTION'
  | 'INVALID_REDACTION_INPUT';
const messages: Record<SecretErrorCode, string> = {
  INVALID_SECRET_REF:
    'Use a symbolic namespace:name reference with the documented lowercase identifier format.',
  INVALID_SECRET_CONFIGURATION:
    'Configure an absolute host directory and an explicit reference-to-filename allowlist.',
  UNSUPPORTED_SECRET_HOST:
    'This provider requires POSIX ownership and permission checks.',
  UNKNOWN_SECRET_REF:
    'The requested symbolic reference has no host-controlled binding.',
  UNSAFE_SECRET_DIRECTORY:
    'Use a real private directory owned by the control-plane account or root.',
  UNSAFE_SECRET_FILE:
    'Use a private nonexecutable regular file owned by the control-plane account or root, without symbolic or hard links.',
  SECRET_FILE_UNAVAILABLE:
    'The bound secret file is unavailable; check host provisioning and access.',
  INVALID_SECRET_FILE:
    'Secret files must contain nonempty valid UTF-8 data of at most 64 KiB.',
  INVALID_SECRET_HANDLE:
    'Supply only handles resolved by this Core secret provider boundary.',
  SECRET_HANDLE_DISPOSED:
    'The secret handle was disposed; resolve a fresh handle for another action.',
  SECRET_HANDLE_ACTIVE:
    'The secret handle is already in use; wait for its action to settle.',
  SECRET_VALUE_EXPIRED:
    'Secret material is available only during its trusted action.',
  SECRET_SERIALIZATION_FORBIDDEN:
    'Resolved secret values cannot be serialized; persist only symbolic references.',
  SECRET_ACTION_FAILED:
    'The action using secret material failed; original error details are withheld.',
  INVALID_SECRET_ACTION:
    'Supply a trusted action callback for scoped secret use.',
  INVALID_REDACTION_INPUT: 'The diagnostic value could not be redacted safely.',
};
const errorCodes = new WeakMap<object, SecretErrorCode>();
export function secretErrorCode(error: unknown): SecretErrorCode | undefined {
  return (typeof error === 'object' && error !== null) ||
    typeof error === 'function'
    ? errorCodes.get(error)
    : undefined;
}
export function secretFailure(
  error: unknown,
  fallback: SecretErrorCode,
): SecretError {
  return new SecretError(secretErrorCode(error) ?? fallback);
}
export class SecretError extends Error {
  readonly code: SecretErrorCode;
  constructor(code: SecretErrorCode) {
    const safeCode =
      typeof code === 'string' && Object.hasOwn(messages, code)
        ? code
        : 'INVALID_SECRET_CONFIGURATION';
    super(messages[safeCode]);
    this.name = 'SecretError';
    this.code = safeCode;
    errorCodes.set(this, safeCode);
  }
}
export function parseSecretRef(value: unknown): SecretRef {
  if (
    typeof value !== 'string' ||
    !/^[a-z][a-z0-9-]{0,31}:[a-z0-9][a-z0-9._-]{0,127}$/.test(value)
  ) {
    throw new SecretError('INVALID_SECRET_REF');
  }
  return value as SecretRef;
}
