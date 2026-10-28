# Provider contracts

FR-006 defines `SourceControlProvider` and `WorkProvider` in `@mz/core`. Domain code consumes neutral records and references rather than a GitHub SDK response. `@mz/github` supplies an offline `createGitHubProviderSkeleton({audit})` implementation of both interfaces. It validates inputs and audits attempted operations, then rejects with `NOT_IMPLEMENTED`. It performs no HTTP request, resolves no credential, and returns no fabricated repository/work data.

## Neutral identities and records

A `ProviderReference` contains `provider`, `kind`, `externalId`, and optional descriptive `url`. `RepositoryReference` fixes kind to `repository`; `WorkItemReference` fixes it to `work-item`. Identity is the provider/kind/externalId tuple. URLs are not identity, a transport destination or an authorization grant. Different providers can use their own scoped external identifier formats without changing Core.

The GitHub skeleton accepts repository identifiers such as `example/project` and work items such as `example/project#142`. A bare issue number is ambiguous across repositories and is rejected. Its initial syntax permits a 1–39 character alphanumeric/hyphen owner starting with an alphanumeric, a 1–100 character alphanumeric/dot/underscore/hyphen repository except `.` and `..`, and a positive 1–15 digit issue number without leading zeros. These are this skeleton's validation limits, not a claim of exhaustive GitHub naming support. Provider name is `github`; a reference for another provider is rejected. Optional URL metadata is a string of at most 2048 characters and is discarded before auditing; no URL is fetched.

| Interface               | Operation                                           | Neutral result                           |
| ----------------------- | --------------------------------------------------- | ---------------------------------------- |
| `SourceControlProvider` | `getRepository(ref, action)`                        | `{ref, defaultBranch}`                   |
| `WorkProvider`          | `getWorkItem(ref, action)`                          | `{ref, repository, title, body, status}` |
| `WorkProvider`          | `createWorkItem({repository, title, body}, action)` | Same work-item record                    |

Work status is `open` or `closed`. The public create contract represents deliberate publication; a future integration must enforce capabilities and sanitized promotion before calling it. The skeleton accepts a nonblank title up to 256 UTF-16 code units and a body up to 65536 code units. It never publishes or persists that content. Private intake is not automatically promoted by possessing a WorkProvider. GitHub Issues/Projects remain planning authority; these DTOs do not create a competing runtime task tracker.

## Auditable action boundary

Every operation requires `{actionId, actorId, runId?}` with canonical lowercase UUIDs. The trusted caller supplies a new action identity per attempt and the assigned actor/run identities. References and action inputs use strict own-data properties; extra fields/accessors are rejected before auditing. Action IDs correlate start and outcome, not a promise of remote idempotency or permission.

The injected `ProviderAuditSink.append(record)` must resolve only after a durable append. Records contain action/actor/optional run IDs, provider, operation, target identity **without URL**, canonical UTC `occurredAt`, and phase `started`, `succeeded`, or `failed`. A failed record has a bounded `ProviderErrorCode`. Titles, bodies, tokens, arbitrary payloads, raw errors and provider SDK objects are absent from the record type and skeleton output. Records and nested target references are frozen.

The skeleton awaits a started acknowledgement before attempting terminal failure auditing, then emits failed/NOT_IMPLEMENTED under the same action identity. If either append fails, the caller receives `AUDIT_FAILED`, without the sink's raw message/cause. If the start fails, there is no second record or remote action. If final auditing fails, an acknowledged start can remain without an outcome; the host must reconcile it. The trusted sink can lie about durability; FR-006 does not independently prove storage, add a SQLite provider-action table, or deploy a sink. Integrating real actions with durable runtime records requires the corresponding schema migration and tests rather than arbitrary event payloads.

`ProviderError` uses static messages and codes: `INVALID_INPUT`, `NOT_IMPLEMENTED`, `AUDIT_FAILED`, and reserved `PROVIDER_FAILED`. Invalid options fail when the skeleton is created; malformed operation inputs reject before audit. There is no success path in the skeleton. A future remote implementation must audit real outcomes, fail closed on unavailable start auditing, avoid success claims after final audit failure, and reconcile ambiguous remote outcomes before retrying writes.

## Verification and limits

Synthetic tests cover all three operation contracts, scoped references, input/getter rejection, no content/URLs in audits, audit ordering and sink errors. TypeScript fixtures verify that neutral DTOs compile, vendor result objects are incompatible, and failed audits require a safe error code. Clean-install coverage imports the provider package from an unrelated directory. No real GitHub API, credentials, capability enforcement, remote idempotency, synchronization, deployment provider or production audit sink was exercised.

FR-015 adds a separate live App client and neutral Core provisioning contract for the pilot; see [App permissions, credential transport and project recovery](github-app.md). This does not turn the original generic work-provider skeleton into a complete live integration.
