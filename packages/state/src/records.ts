import {
  MAX_INTAKE_BYTES,
  type InboxScope,
  type NewInboxIntake,
} from './intake-types.js';
import { randomUUID } from 'node:crypto';
import {
  RUNTIME_EVENT_TYPES,
  RuntimeStateError,
  type RuntimeEventType,
  type RunOutcome,
} from './types.js';

export function invalid(field?: string): never {
  throw new RuntimeStateError(
    'INVALID_INPUT',
    'Use only the documented structural fields, canonical identifiers, and UTC timestamps.',
    field,
  );
}
export function record(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    return invalid();
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !fields.includes(key)) return invalid();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) return invalid(key);
    result[key] = descriptor.value;
  }
  return result;
}
export function uuid(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    return invalid(field);
  return value;
}
export function newId(value: unknown): string {
  return value === undefined ? randomUUID() : uuid(value, 'id');
}
export function timestamp(value: unknown, field: string): string {
  if (value === undefined) return new Date().toISOString();
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  )
    return invalid(field);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value)
    return invalid(field);
  return value;
}
export function eventType(value: unknown): RuntimeEventType {
  if (
    typeof value !== 'string' ||
    !(RUNTIME_EVENT_TYPES as readonly string[]).includes(value)
  )
    return invalid('type');
  return value as RuntimeEventType;
}
export function outcome(value: unknown): RunOutcome {
  if (value !== 'succeeded' && value !== 'failed' && value !== 'cancelled')
    return invalid('outcome');
  return value;
}
export function cursor(input: unknown): {
  afterSequence: number;
  limit: number;
} {
  const value = record(input ?? {}, ['afterSequence', 'limit']);
  const afterSequence = value['afterSequence'] ?? 0;
  const limit = value['limit'] ?? 100;
  if (
    typeof afterSequence !== 'number' ||
    !Number.isSafeInteger(afterSequence) ||
    afterSequence < 0
  )
    return invalid('afterSequence');
  if (
    typeof limit !== 'number' ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 1000
  )
    return invalid('limit');
  return { afterSequence, limit };
}

export function inboxScope(value: unknown): InboxScope {
  if (value === undefined) return 'unclassified';
  if (
    value === 'unclassified' ||
    value === 'company' ||
    value === 'project-candidate' ||
    (typeof value === 'string' && /^project:[a-z][a-z0-9-]{0,63}$/.test(value))
  )
    return value as InboxScope;
  return invalid('scope');
}
export function inboxIntake(input: unknown): Required<NewInboxIntake> {
  const values = record(input, ['sourceType', 'sourceBytes', 'scope']);
  const sourceType = values['sourceType'];
  const sourceBytes = values['sourceBytes'];
  if (sourceType !== 'file' && sourceType !== 'stdin')
    return invalid('sourceType');
  if (
    typeof sourceBytes !== 'number' ||
    !Number.isSafeInteger(sourceBytes) ||
    sourceBytes < 1 ||
    sourceBytes > MAX_INTAKE_BYTES
  )
    return invalid('sourceBytes');
  return { sourceType, sourceBytes, scope: inboxScope(values['scope']) };
}
