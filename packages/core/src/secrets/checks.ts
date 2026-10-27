/** Additional diagnostic guard only; not an assurance scan or general secret detector. */
export function containsObviousCredential(value: string): boolean {
  return /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S+|\b(?:password|token|secret)\s*[:=]\s*\S+)/i.test(
    value,
  );
}
