# Deterministic context compiler

FR-010 adds `mz context` and `@mz/context.compileContext`. It assembles selected curated company knowledge into a bounded traceable bundle, without a model call, provider query, runtime write, worker launch or raw inbox read. Compiled text is informational: execution still requires independently assigned capabilities and any required human approval. A role/project argument is a trusted caller's selection, not authentication or permission expansion.

```sh
mz context --company /absolute/private/company --role developer --task orientation
mz context --role developer --project example-project --task review --json
mz context --role developer --task orientation --max-bytes 32768
```

`--role` and `--task` are required. Optional `--project` selects one project. Names are 1–64 lowercase ASCII letters/digits/hyphens, beginning with a letter. `--company` follows existing flag/environment (`MZ_COMPANY_DIR`)/ancestor discovery conventions. `--json` emits the bundle; default output is its rendered text. `--help` needs no configuration. Unknown/duplicate/missing options or invalid budgets/IDs exit2 without echoing arguments. Source/scope/credential/budget failures exit1 with static errors and **no partial context**. Success exits0.

Context contains private curated knowledge intentionally requested by the caller. Keep generated output in private worker context rather than public issues or operational logs. There is no automatic artifact file or export path in this ticket. If retaining output, use an operator-approved private location/permissions. Do not put credential values in curated company Git; symbolic references are preserved without being resolved.

## Source graph and required files

| Layer                      | Selected source                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Company                    | `company.yaml`, `COMPANY.md`, `AUTHORITY.md`                                                    |
| Role                       | `roles/<role>.md`                                                                               |
| Relevant processes         | Declared `processes/<id>.md`, deduplicated/sorted                                               |
| Optional project           | `projects/<project>/project.yaml`, `PROJECT.md`, `ARCHITECTURE.md`, `STATUS.md`, `DECISIONS.md` |
| Relevant policies          | Always `policies/security-baseline.md`, plus declared policies, deduplicated/sorted             |
| Relevant company decisions | Declared `decisions/<id>.md`, deduplicated/sorted                                               |
| Current task               | `tasks/<task>.md`, or `projects/<project>/tasks/<task>.md` for a selected project               |

All selected files are required. Missing authority/policy/project/task material fails rather than disappearing. The compiler never scans directories or loads the entire handbook, other projects, old conversations, intake source files, runtime history or secret storage. Project DECISIONS.md is the selected project's decision material; additional decision references target company decisions.

Role/task Markdown front matter and selected project YAML can declare `processes`, `policies`, and `decisions`, each an array of at most32 slugs. Their unions select those global source directories. References in process/policy/decision bodies or their metadata are informational only, without transitive expansion. No wildcard/path/URL reference can choose an additional source reader. There is no hidden model relevance inference.

```yaml
---
role: developer
project: example-project # For a project task; omit for a company task.
processes: [development, release]
policies: [security-baseline]
decisions: [decision-example]
work:
  provider: github
  kind: work-item
  externalId: example/project#142
  url: https://example.invalid/project/issues/142
---
```

Only task metadata `work` becomes the bundle's optional provider-neutral work reference. Its scalar identities/HTTPS URL are validated; userinfo credentials/control characters are rejected, and the URL is never fetched. Curated STATUS.md is captured as evidence, not treated as live provider truth. GitHub integration remains an offline skeleton until its real implementation is provisioned.

Optional role metadata `role` and task metadata `role`/`project` must match the caller's selection; project YAML must identify the selected `project`. Other safe metadata remains informational. Activation metadata such as `pending-owner-approval` does not block planning context or grant execution authority. The generic starter includes company `orientation` and project `review` examples.

Strict normalized Core reads (`{rejectLinks:true, normalizeLineEndings:true}`) reject symbolic aliases in any selected path and multiply linked files, including company.yaml, so a selected project source cannot alias another project's material. The marker's normalized identity must still match the Core-loaded config snapshot. The general company loader retains its previous default internal-link behavior. A malicious trusted host can rewrite/copy source contents or lie through a custom reader; this compiler is not a host sandbox or an access-control service. Callers supply an actual trusted repository port and independently assigned role/project scope.

## Determinism, traceability and budgets

The [v1 bundle contract](../schemas/context-bundle-v1.md) includes selection, optional work reference, ordered source manifest, rendered text and text byte count. Each source manifest entry is a relative path, normalized SHA256 and normalized byte count. Markdown normalization captures `{kind,metadata,body}`; YAML captures `{kind,value}`. Object keys are recursively sorted; key controls/obvious credential patterns are rejected without rewriting keys. CRLF/CR becomes LF before front matter/YAML parsing as well as canonical rendering, so CR-only role declarations cannot disappear. The digest hashes canonical JSON for that captured representation. It is not a raw-file hash. Rendered text embeds the same per-source digests and each selected document once.

Unchanged captured sources/options yield identical text and JSON, including across absolute repository locations. No current time, random run ID, absolute root, live provider result or environment-specific state is inserted. Document order follows the table above; declared sets sort lexically. Compiler reads are cached per path. Files in a working tree are not an atomic Git snapshot: pin a revision/avoid concurrent edits when requiring one. Digests describe the normalized content actually captured, not an unverified commit identity.

Default budget is65536 bytes; `--max-bytes` permits1024..1048576. Both rendered text and the **complete JSON response**, including metadata/digests/framing/newline, must fit. At most64 unique source documents and32 entries per declared reference array are permitted. The total graph is checked before following excessive references; normalized-content accounting fails early, and final output framing is checked before emission. No truncation, omission or fallback summary occurs. Curate overly large selected documents or explicitly choose a larger bounded budget.

Unsupported C0/C1 controls are rejected (LF/tab remain allowed in document text; keys allow no controls). Credential-pattern checks also apply to mapping keys. Core's shared obvious-credential heuristic rejects common token/access-key/private-key/Bearer/assignment patterns. Sensitive metadata keys such as secret/password/token/credentials/apiKey/privateKey require symbolic references at their string leaves. These are additional bounded guards, not proof of arbitrary secret detection; values must already be absent from curated source control. Reference symbols are not resolved, inspected or sent to a provider.

## Core integration and verification

```js
import { loadCompanyRepository } from '@mz/core';
import { compileContext } from '@mz/context';

const company = await loadCompanyRepository({
  directory: '/absolute/private/company',
});
const bundle = await compileContext({
  company,
  role: 'developer',
  task: 'orientation',
});
// Deliver bundle.text only to the authorized worker under private host controls.
```

`ContextError` has static codes/messages for invalid options, source failure, scope mismatch, budget overflow and detected credential values. It retains no original content/path/error cause. Trusted reader methods may perform reads; returned metadata is normalized using data descriptors without invoking getters/toJSON. No new company config or SQLite schema migration is needed; this is the first ephemeral bundle format, not persisted runtime state.

Synthetic tests verify exact relevant captures, unrelated project/process exclusion, alias/hardlink rejection, matching identities, deterministic key/EOL/root normalization, known normalized digest, text+JSON boundaries, graph/reference limits, credential rejection and symbolic reference preservation, getter/error privacy, real CLI no-partial-output behavior and fresh installed context generation. Existing company/doctor/secret/state/backup/inbox tests remain required. No actual private organization context, live model/provider or worker invocation was exercised.
