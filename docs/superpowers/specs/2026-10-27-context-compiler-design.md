# FR-010 Context compiler

Deliver MZ-010 in M-03 after M-02 exit. The active all-ticket goal delegates routine implementation choices. Compilation is informational, never execution authority, project activation or a substitute for provider work status.

## Approach

A handbook scan would include unrelated/private material and grow without bounds. A model-based summarizer would add nondeterminism and cost before required. Select a small named source graph through the existing Core company repository loader, normalize/trace captured documents, and fail explicitly on invalid references, missing required material or budget overflow. Do not silently truncate policies. No network, model, runtime writes or raw inbox source access.

Package @mz/context depends on Core; Core remains independent of the compiler. `compileContext({company,role,project?,task,maxBytes?})` takes a trusted CompanyRepository port, assigned role/task slug and optional project slug. Slugs follow the letter-leading lowercase letter/digit/hyphen 1–64 convention. Role/project selection is supplied by the trusted caller; it is not identity/capability verification.

## Source graph

Always include normalized company.yaml config snapshot, COMPANY.md, AUTHORITY.md, roles/<role>.md, policies/security-baseline.md and the selected task. Company-level task: tasks/<task>.md; project task: projects/<project>/tasks/<task>.md. Optional project adds project.yaml plus PROJECT.md, ARCHITECTURE.md, STATUS.md and DECISIONS.md from that project directory. Required missing documents fail.

Compiler reads request Core rejectLinks/normalizeLineEndings options: direct single-link source files only, EOL normalized before parsing (default general loader behavior preserved). Reject unsafe controls/credential patterns in mapping keys without rewriting them.

Role Markdown front matter, selected project YAML and task front matter may declare `processes`, `policies`, `decisions` arrays of at most32 slug references. Union/deduplicate/sort them; load processes/<id>.md, policies/<id>.md and company decisions/<id>.md only. Always include the security baseline even if no references declare it. No wildcard/recursive scan, paths in references, transitive expansion from process/policy/decision bodies or unrelated project reads. At most64 captured sources. Role metadata `role`, task `role`/`project`, and project YAML `project`, when present, must match caller selection; project YAML project identity is required. A project with pending activation may be discussed, but compilation never activates it or grants permission.

Task front matter may contain a provider-neutral `work` reference {provider,kind,externalId,url?}; validate bounded scalar identity/https URL without credentials. Do not fetch it or infer authoritative current provider state from curated STATUS.md. Other safe metadata is informational context only. Source documents and selected metadata never execute instructions or dynamically choose a reader/function.

## Output, bounds and credential boundary

Return a schemaVersion1 bundle with selection, optional work reference, source manifest (relative path, normalized SHA256, normalized byte count), rendered text and textBytes. No absolute repository root, generated timestamp, random ID or environment-specific state enters output. Normalize CRLF/CR to LF and recursively sort metadata keys. Digest the canonical JSON representation of each captured source (kind/value for YAML, kind/metadata/body for Markdown); this is a normalized captured-content digest, not a raw-file hash or Git commit assertion. Render fixed layer/source ordering with embedded digests and one occurrence of captured content. Cache source reads so each path is captured once.

Default maxBytes65536, permitted1024..1048576; enforce both rendered-text bytes and JSON response bytes, including manifest/framing. Cap source count64 and declared reference arrays32. Fail rather than omit/truncate. Early normalized-content accounting prevents reading an unbounded corpus. Deterministic means unchanged captured input/options produce byte-identical text/JSON, across repository root locations. Multiple working-tree files are not an atomic Git snapshot; caller should pin a revision/avoid concurrent edits. Digests describe the actual captured normalized content.

Reject unsupported control characters and obvious credential values before returning output. Reuse Core's doctor credential-pattern heuristic, plus sensitive metadata keys requiring symbolic refs instead of raw values. Symbolic refs are never resolved. This is a bounded additional guard, not proof of arbitrary credential detection; curated company Git must already exclude values. No raw inbox ingestion path, original source name or runtime credential store is read. Source bodies are private knowledge intentionally emitted by this command, not diagnostic logs; keep generated context private. Errors contain static codes/messages only, never source content, rejected paths or caught exceptions.

CLI `mz context --role ROLE --task TASK [--project PROJECT] [--company DIR] [--max-bytes N] [--json]` loads Core company config and emits text/JSON after the entire bundle passes. Role/task required, no default authority/worker assumed. Company uses existing flag/environment/discovery conventions. Exit0 success,1 source/scope/budget/credential failure,2 invalid arguments. No file export, model invocation, automatic worker launch, database access or provider action in this ticket.

## Verification

Synthetic company fixtures include relevant role/task/project/process/policy/decision material plus unreadable/unrelated documents. Verify exact expected captures, stable ordering/digests/text across runs/root paths/metadata insertion order, missing/mismatched/escaping references, size/source/reference limits, source/error privacy, obvious credential rejection and symbolic reference preservation. Real CLI verifies strict args/text/JSON/no partial output and installed entry point. Full check/typecheck, independent review and exact-head CI before merge. No actual private company context or live provider/model is invoked.
