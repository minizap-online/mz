# FR-006 provider abstractions

Implement MZ-006 in M-01: provider-neutral source-control/work contracts, a GitHub skeleton, and an auditable action contract. The active all-ticket instruction delegates routine design choices; this document records implementation choices, not additional user decisions.

## Approaches and choice

Type-only empty interfaces would not demonstrate how a provider fails or audits. A real GitHub client would require remote integration beyond this ticket's skeleton scope. Use small Core interfaces plus an offline GitHub implementation that rejects unsupported operations with safe errors and emits structural attempted/failed audit records. No SDK, HTTP client, credentials or remote object types enter Core.

## Contracts

Core defines a provider reference `{provider, kind, externalId, url?}`. Generic kinds cover repository and work-item; provider IDs are namespaced strings and external identities are scoped within their provider (GitHub owner/repo and owner/repo#number). URL is optional descriptive metadata, not identity or authorization. SourceControlProvider reads repository metadata. WorkProvider reads a work item and creates an explicitly supplied issue title/body under a repository. Work item status is open/closed, not an editable runtime planning board. Do not introduce deployment, pagination, synchronization or provider-specific project fields before needed.

Each operation requires an action context with UUID action/actor identities and optional run identity. Providers receive a trusted async audit sink. Structural audit records contain action/actor/run, provider, operation, target reference without URL, timestamp, phase started/succeeded/failed, and a bounded safe error code on failure. Request titles/bodies, credential refs/values, URLs and arbitrary provider errors are never audit fields. The sink must acknowledge durable append before the operation may proceed. Audit failure returns a static AUDIT_FAILED error and prevents remote execution when the start cannot persist. A failed final audit cannot be returned as a successful action. Provider audit is an integration contract; FR-006 does not add a runtime table or claim deployment of a durable sink.

The GitHub skeleton validates own-data inputs, UUIDs, operation target kind/provider and GitHub identity syntax without invoking getters. It preserves a configured trusted audit sink, emits started then failed records, and throws NOT_IMPLEMENTED; it performs no network calls and never reports fake repository/work data. Invalid input fails before auditing; audit errors are sanitized and fail closed. A thrown proxy/error is not reflected into logs. The current skeleton cannot succeed, so it needs no token or activation permission. Future real create operations must enforce capabilities and sanitized promotion upstream; possessing an interface never grants authority.

## Verification

Use synthetic node:test fixtures to verify reference scoping, output DTO types with TypeScript compile checks, no vendor types in Core, preserved start/failure action identity, no request content/URLs in audit records, invalid fields/accessors, and failing/throwing sinks. Clean-install coverage checks GitHub exports from an unrelated directory. Full check/typecheck, independent review and exact-head CI precede merge.
