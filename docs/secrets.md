# Secret references and scoped use

FR-004 provides symbolic references, a host-controlled file provider, opaque resolved handles, and diagnostic redaction through `@mz/core`. It does not configure actual host credentials, mount them into workers, exchange tokens, or implement a hosted secret manager.

## References and provider

`parseSecretRef()` validates the branded string `namespace:name`. Namespace is a lowercase letter followed by lowercase letters/digits/hyphens (1–32 characters); name begins with a lowercase letter/digit and continues with lowercase letters/digits/dot/underscore/hyphen (1–128 characters). Slashes and path traversal are forbidden. Examples: `github-app:example`, `dns:project-zone`.

References can be serialized as references; resolved values cannot. Do not put a credential in a reference. No company configuration or SQLite schema changes ship in this ticket, and no secret values are written to either store.

```ts
interface SecretProvider {
  resolve(ref: SecretRef): Promise<SecretHandle>;
}
```

The first provider is `await createHostFileSecretProvider({directory, bindings})`. `directory` is an explicit absolute POSIX host path; `bindings` maps allowlisted refs to simple filenames, never arbitrary paths. The provider copies bindings and reads only the requested file when resolving a known ref. A new resolve sees a rotated file; an existing handle owns its original material until use/disposal.

```js
import { createHostFileSecretProvider, parseSecretRef } from '@mz/core';

const provider = await createHostFileSecretProvider({
  directory: '/run/credentials/mz.service',
  bindings: { 'github-app:example': 'github-app' },
});
const handle = await provider.resolve(parseSecretRef('github-app:example'));
```

This example describes host setup; no such path or actual credentials are provisioned by the implementation. The control-plane operator must create/provision them using host or systemd credential facilities, outside worker workspaces. Do not put values in command-line arguments, environment dumps, source, tickets, logs, prompts, or examples. Grant an action only the provider references it needs; this library is not a capability grant or a substitute for host/process separation.

## Filesystem checks

The provider requires POSIX ownership and permissions; unsupported hosts fail rather than pretend these checks work.

- Selected root must be a real directory (not a symlink), owned by the effective control-plane UID or root, with no group/other permissions (typically 0700).
- Canonical ancestors must have approved ownership and cannot be group/world writable unless sticky-bit protected, such as /tmp. This prevents another account replacing the private directory through an unprotected parent.
- Bound files must be regular, non-symlink, single-link, owned by the effective UID or root, and nonexecutable with no group/other permissions (typically 0600 or 0400).
- The provider uses O_NOFOLLOW and nonblocking open, verifies the opened descriptor, and reads at most 64 KiB. Directory/ancestor checks run again on resolve.
- Contents must be nonempty valid UTF-8. Exact text is preserved, including leading BOMs and trailing newlines; there is no silent trim or normalization. Provision the exact value required by the client.

These checks do not defend against a malicious root/control-plane account or host administrator replacing configuration concurrently. Actual access is still governed by the OS; permitting root ownership in validation does not grant read permission to another UID.

## Opaque handles and action lifetime

A `SecretHandle` exposes `ref`, `use(action)`, and `dispose()`. The action receives a `SecretValue` with explicit `revealText()`. Raw buffers are private, not object properties. Handles and scoped values:

- Throw `SECRET_SERIALIZATION_FORBIDDEN` from JSON serialization, including nested serialization.
- Display `[REDACTED]` through string coercion and Node inspection, without exposing material when inspection hooks are disabled.
- Cannot be structured-cloned into a duplicate of the material.
- Expire after the trusted action settles. A handle is one-shot; resolve again for another action.

```js
try {
  const result = await handle.use(async (secret) => {
    // This is the explicit trusted boundary into your approved client call.
    return await performApprovedAction({
      authorization: `Bearer ${secret.revealText()}`,
    });
  });
  // result must contain no revealed material.
} finally {
  handle.dispose();
}
```

`performApprovedAction` represents the application's approved client, not an implemented integration. Concurrent use/dispose of an active handle fails. Dispose is otherwise idempotent. Use always zeroes/releases its private byte buffer in finally, including on callback failure. Callback errors become `SECRET_ACTION_FAILED`; their original messages and causes are withheld.

JavaScript cannot revoke or zero a primitive string after explicit revelation. Callbacks are trusted control-plane code: never return, persist, log, copy into prompts, or expose revealed strings to workers. Wrapper serialization guards and best-effort buffer zeroing do not sandbox a malicious callback or erase copies made by a client/library/VM.

## Redaction

`redactForLogging(value, handles?)` returns a detached JSON-safe representation. It replaces known Core handles/scoped values and binary buffers/views with `[REDACTED]`, avoids invoking getters/toJSON/custom inspection, and handles cycles and nesting/size bounds.

Supplying live handles also removes their exact text plus JSON-escaped and URI-encoded forms from strings and object keys:

```js
import { redactForLogging } from '@mz/core';

await handle.use(async (secret) => {
  const diagnostic = { authorization: `Bearer ${secret.revealText()}`, handle };
  console.log(redactForLogging(diagnostic, [handle]));
  return await performApprovedAction({
    authorization: `Bearer ${secret.revealText()}`,
  });
});
```

Use value-aware redaction while handles are live. Passing a disposed or unrecognized handle fails rather than silently returning unredacted text. Known wrapper objects remain redacted even after disposal when no value matching is requested. The helper is not a detector for arbitrary unknown credentials or transformed copies; logging revealed primitives directly remains prohibited.

## Errors and evidence

`SecretError` contains a stable code and static safe message, without paths, material, input values, or OS/callback causes. Codes distinguish invalid refs/configuration, unsupported host, unknown binding, unsafe directory/file, unavailable/invalid file, active/disposed/expired handles, forbidden serialization, failed action, and invalid redaction input. Operators should diagnose the code against their private host configuration without logging the file contents.

Tests use temporary 0700 directories and synthetic 0600 files. They verify real permission/link checks, bounds, UTF-8 preservation, rotation, serialization/inspection behavior, action lifecycle, redaction, safe failures, and Core-state rejection. They do not read or validate actual host credentials, provision a control-plane account, or establish real provider permissions.

## Native GitHub setup credentials

[GitHub setup](github-setup.md) can provision an owner-entered fine-grained token directly to a private native GitHub CLI profile via stdin. This is a host credential-provisioning field, separate from model/company context. Existing protected-file input uses Core SecretProvider/one-shot handles. The token is not passed in argv or exported into the owner Codex process; only a profile reference reaches clients. The native profile deliberately uses owner-only unencrypted local files rather than overwriting a shared personal keyring entry. Signing in does not grant organization membership or prove optional write permissions.
