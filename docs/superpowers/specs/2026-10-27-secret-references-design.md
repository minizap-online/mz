# FR-004 Secret reference abstraction

## Intent and scope

Implement MZ-004: symbolic references, a host-controlled provider, opaque resolved handles, serialization prohibition, and redaction. The owner authorized continuing tickets in milestone order on 2026-10-27. These API choices are implementation decisions within that scope.

Use Core modules and Node filesystem primitives. No hosted secret manager, actual credentials, worker-wide mounts, token exchange, new CLI command, provider integration, company configuration schema, or SQLite schema change is included. No migration is needed because this adds an in-memory contract and keeps existing persistent schemas unchanged.

## References and provider

`parseSecretRef(value): SecretRef` validates a branded string: `namespace:name`, where namespace is lowercase ASCII starting with a letter (1–32 chars, letters/digits/hyphens) and name starts with a lowercase letter/digit (1–128 chars, lowercase letters/digits/dot/underscore/hyphen). No slash or path traversal is allowed. References such as github-app:example and dns:project-zone are safe to serialize as references; they are not secret values.

`SecretProvider.resolve(ref): Promise<SecretHandle>` is vendor-neutral. The first provider is `createHostFileSecretProvider({directory, bindings})`, returning a Promise of a provider. Directory is an explicit absolute POSIX host path; bindings is a copied allowlist of symbolic refs to simple filenames. No filename is derived from an incoming ref. Resolve reads only the requested binding. Unknown references fail before filesystem reads. Reject unknown config fields and accessors rather than evaluating them.

The selected directory must be a real directory, owned by the effective control-plane UID or root, with no group/other permissions. Canonicalize it and revalidate on each resolve. Canonical ancestors must also be owned by root/the effective UID and not group/world writable unless protected by the sticky bit (such as /tmp), preventing another account replacing the private directory. Reject a symlink selected as the root. Files must be regular, non-symlink, single-link, owned by the effective UID or root, without group/other or executable permissions. Use O_NOFOLLOW and nonblocking open, then verify descriptor metadata before reading. Read at most 64 KiB and require nonempty valid UTF-8, preserving its exact text including line endings. Fail safely on hosts without POSIX ownership/permission support. File/provider errors contain no source values, paths, or raw OS error causes.

This is trusted host administration, not protection from a hostile root account or malicious concurrent host configuration replacement. Operators must keep the directory outside worker workspaces and scope provider access to the action's required references.

## Handle and scoped use

`SecretHandle` has `ref`, `use(action)`, and `dispose()`; serialization/coercion/inspection hooks reveal no material. Private buffers live in a WeakMap/closure, never enumerable properties. `toJSON()` throws a stable serialization-forbidden error (also when nested); String/coercion and Node inspection produce a redacted marker. Own methods also prevent structured cloning from silently copying material.

`use(action)` runs once, gives the trusted callback an opaque `SecretValue`, and disposes/zeroes the private byte buffer in finally. The scoped value supplies `revealText()` for explicit injection into a client call. It has the same serialization/logging protections and expires immediately when the action settles. It cannot be used outside the action or concurrently reused. `dispose()` is idempotent and zeroes an unused handle; dispose during an active action fails rather than invalidating material mid-action. Callback errors become a source-safe SECRET_ACTION_FAILED error without original messages or causes.

Revealed primitive strings cannot be retroactively secured or zeroed by JavaScript. Callbacks are trusted control-plane code: never return, log, persist, or put revealed primitives into prompts. This boundary prevents accidental serialization of the wrapper and limits material lifetime; it is not a sandbox for malicious callbacks.

## Redaction

`redactForLogging(value, handles?)` creates a JSON-safe detached representation, replacing known handles/scoped values and all binary views with [REDACTED]. It does not invoke getters, toJSON, or custom inspection functions, and handles cycles/depth bounds. Supplied live handles additionally redact their exact text and JSON-escaped/URI-encoded forms from strings and object keys. Reject supplied disposed/invalid handles instead of silently failing to redact.

The helper is not a universal credential detector. Revealed strings copied/transformed outside the action remain the caller's responsibility. Default wrapper coercion/inspection is always redacted; action errors are always sanitized.

## Verification

Use temporary 0700 directories and synthetic 0600 files only. Verify symbolic grammar, allowlist isolation, ownership/permission checks available to the test account, symlink/hardlink/nonregular/oversized/empty/invalid-UTF8 rejection, text preservation, serialization and structured-clone failures, redacted inspection/coercion, nested/cyclic/accessor-safe redaction, one-shot use/disposal/expiry, safe callback/OS errors, and rejection of resolved handles by the existing Core state boundary. Run all existing tests and clean installation. Independent review before merge. Do not read or change actual host credentials.
