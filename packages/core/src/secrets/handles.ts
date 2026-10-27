import { inspect } from 'node:util';
import {
  SecretError,
  secretFailure,
  type RedactedValue,
  type SecretHandle,
  type SecretRef,
  type SecretValue,
} from './types.js';

const REDACTED = '[REDACTED]';
interface Material {
  bytes: Buffer | null;
  state: 'ready' | 'active' | 'disposed';
}
const data = new WeakMap<SecretHandle, Material>();
const sensitive = new WeakSet<object>();
const opaque = {
  toJSON(): never {
    throw new SecretError('SECRET_SERIALIZATION_FORBIDDEN');
  },
  toString: () => REDACTED,
  [Symbol.toPrimitive]: () => REDACTED,
  [inspect.custom]: () => REDACTED,
};

/** Internal ownership transfer: the caller must not retain the supplied buffer. */
export function createSecretHandle(
  ref: SecretRef,
  bytes: Buffer,
): SecretHandle {
  const material: Material = { bytes, state: 'ready' };
  function discard(): void {
    material.bytes?.fill(0);
    material.bytes = null;
    material.state = 'disposed';
  }
  const handle: SecretHandle = Object.freeze({
    ref,
    ...opaque,
    async use<T>(
      action: (value: SecretValue) => T | PromiseLike<T>,
    ): Promise<T> {
      if (material.state === 'disposed')
        throw new SecretError('SECRET_HANDLE_DISPOSED');
      if (material.state === 'active')
        throw new SecretError('SECRET_HANDLE_ACTIVE');
      if (typeof action !== 'function')
        throw new SecretError('INVALID_SECRET_ACTION');
      material.state = 'active';
      let live = true;
      const value: SecretValue = Object.freeze({
        ...opaque,
        revealText(): string {
          if (!live || !material.bytes)
            throw new SecretError('SECRET_VALUE_EXPIRED');
          return material.bytes.toString('utf8');
        },
      });
      sensitive.add(value);
      try {
        return await action(value);
      } catch {
        throw new SecretError('SECRET_ACTION_FAILED');
      } finally {
        live = false;
        discard();
      }
    },
    dispose(): void {
      if (material.state === 'active')
        throw new SecretError('SECRET_HANDLE_ACTIVE');
      discard();
    },
  });
  sensitive.add(handle);
  data.set(handle, material);
  return handle;
}

export function redactForLogging(
  value: unknown,
  handles: readonly SecretHandle[] = [],
): RedactedValue {
  try {
    if (!Array.isArray(handles)) throw new SecretError('INVALID_SECRET_HANDLE');
    const patterns = new Set<string>();
    for (const handle of handles) {
      const material = data.get(handle);
      if (!material) throw new SecretError('INVALID_SECRET_HANDLE');
      if (!material.bytes) throw new SecretError('SECRET_HANDLE_DISPOSED');
      const text = material.bytes.toString('utf8');
      patterns.add(text);
      patterns.add(JSON.stringify(text).slice(1, -1));
      patterns.add(encodeURIComponent(text));
    }
    const ordered = [...patterns]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    function text(input: string): string {
      if (input.length > 1024 * 1024) return '[Oversized REDACTED]';
      let output = input;
      for (const pattern of ordered)
        output = output.split(pattern).join(REDACTED);
      return output;
    }
    const seen = new WeakSet<object>();
    let nodes = 0;
    function visit(input: unknown, depth: number): RedactedValue {
      if (++nodes > 10000 || depth > 32) return '[Depth/Size Limit]';
      if (typeof input === 'string') return text(input);
      if (input === null || typeof input === 'boolean') return input;
      if (typeof input === 'number')
        return Number.isFinite(input) ? input : null;
      if (typeof input !== 'object')
        return typeof input === 'function' ? '[Function]' : null;
      if (
        sensitive.has(input) ||
        ArrayBuffer.isView(input) ||
        input instanceof ArrayBuffer
      )
        return REDACTED;
      if (seen.has(input)) return '[Circular]';
      seen.add(input);
      let descriptors: PropertyDescriptorMap;
      try {
        descriptors = Object.getOwnPropertyDescriptors(input);
      } catch {
        return '[Uninspectable]';
      }
      if (Object.keys(descriptors).length > 10000)
        return '[Oversized REDACTED]';
      if (Array.isArray(input)) {
        const length: unknown = descriptors['length']?.value;
        if (typeof length !== 'number' || length > 10000)
          return '[Oversized REDACTED]';
        return Array.from({ length }, (_, index) => {
          const descriptor = descriptors[String(index)];
          return descriptor && 'value' in descriptor
            ? visit(descriptor.value, depth + 1)
            : '[Accessor/Hole]';
        });
      }
      const output: { [key: string]: RedactedValue } = Object.create(null);
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (descriptor.enumerable)
          output[text(key)] =
            'value' in descriptor
              ? visit(descriptor.value, depth + 1)
              : '[Accessor]';
      }
      return output;
    }
    return visit(value, 0);
  } catch (error) {
    throw secretFailure(error, 'INVALID_REDACTION_INPUT');
  }
}
