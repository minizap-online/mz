import { containsObviousCredential } from './secrets/checks.js';
import type { StewardScope } from '@mz/state';
export class StewardError extends Error {
  constructor() {
    super(
      'The steward operation could not complete safely; check configuration, bounded input, private storage and runtime history.',
    );
    this.name = 'StewardError';
  }
}
export interface StewardRequest {
  schemaVersion: 1;
  scope: StewardScope;
  question: string;
  context: string;
  status: string;
  history: { interactionId: string; summary: string }[];
}
export interface StewardResponse {
  answer: string;
  summary: string;
  decisions: string[];
  triage: string[];
  work: string[];
  knowledgeUpdates: string[];
  handover: {
    completed: string[];
    changed: string[];
    decisions: string[];
    followups: string[];
    risks: string[];
    references: string[];
  };
}
/** Trusted host adapter: no tools/actions; must honor abort and configured cost/time limits. */
export interface StewardWorker {
  invoke(request: StewardRequest, signal: AbortSignal): Promise<unknown>;
}
export function stewardObject(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new StewardError();
  const proto: unknown = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) throw new StewardError();
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !fields.includes(key))
      throw new StewardError();
    const prop = Object.getOwnPropertyDescriptor(input, key);
    if (!prop || !('value' in prop)) throw new StewardError();
    result[key] = prop.value;
  }
  if (Object.keys(result).length !== fields.length) throw new StewardError();
  return result;
}
export function stewardText(value: unknown, maxBytes: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    Buffer.byteLength(value) > maxBytes ||
    containsObviousCredential(value)
  )
    throw new StewardError();
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (
      (code < 32 && code !== 10 && code !== 9) ||
      (code >= 127 && code <= 159) ||
      (code >= 0xd800 && code <= 0xdfff)
    )
      throw new StewardError();
  }
  return value;
}
export const STEWARD_LIST_FIELDS = [
  'decisions',
  'triage',
  'work',
  'knowledgeUpdates',
] as const;
export const STEWARD_HANDOVER_FIELDS = [
  'completed',
  'changed',
  'decisions',
  'followups',
  'risks',
  'references',
] as const;
export function validateStewardResponse(input: unknown): StewardResponse {
  try {
    const data = stewardObject(input, [
      'answer',
      'summary',
      ...STEWARD_LIST_FIELDS,
      'handover',
    ]);
    const list = (value: unknown): string[] => {
      if (!Array.isArray(value) || value.length > 16) throw new StewardError();
      const result: string[] = [];
      for (let i = 0; i < value.length; i++) {
        const item = Object.getOwnPropertyDescriptor(value, String(i));
        if (!item || !('value' in item)) throw new StewardError();
        result.push(stewardText(item.value, 2048));
      }
      return result;
    };
    const handover = stewardObject(data['handover'], STEWARD_HANDOVER_FIELDS);
    const result: StewardResponse = {
      answer: stewardText(data['answer'], 8192),
      summary: stewardText(data['summary'], 2048),
      decisions: list(data['decisions']),
      triage: list(data['triage']),
      work: list(data['work']),
      knowledgeUpdates: list(data['knowledgeUpdates']),
      handover: {
        completed: list(handover['completed']),
        changed: list(handover['changed']),
        decisions: list(handover['decisions']),
        followups: list(handover['followups']),
        risks: list(handover['risks']),
        references: list(handover['references']),
      },
    };
    if (Buffer.byteLength(JSON.stringify(result)) > 32768)
      throw new StewardError();
    return result;
  } catch {
    throw new StewardError();
  }
}
