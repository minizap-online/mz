# Context bundle v1

FR-010 introduces the first ephemeral context format. There is no previous bundle schema to migrate and no SQLite schema/table change. Core company schema v1 is unchanged; future persisted or incompatible format changes require an explicit version/migration contract.

| Field           | Contract                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | Integer1                                                                                                                     |
| `selection`     | `{company,role,project,task}`; project is slug or null                                                                       |
| `work`          | Provider-neutral `{provider,kind,externalId,url?}` or null; reference only, no fetched provider object                       |
| `sources`       | Ordered entries `{path,sha256,bytes}` with relative selected path, lowercase SHA256 and normalized representation byte count |
| `text`          | Fully rendered selected context with source digests and informational authority boundary                                     |
| `textBytes`     | Exact UTF-8 byte length of text                                                                                              |

Canonical source representations use recursively sorted safe object keys and LF-normalized values. Keys are not rewritten; controls/obvious credential patterns in keys fail. Context reader normalization happens before front matter parsing, including CR-only input. Markdown is `{body,kind:"markdown",metadata}`; YAML is `{kind:"yaml",value}` when serialized in sorted-key order. Hash canonical JSON UTF-8 bytes. These digests trace captured normalized contents, not raw files or an atomic Git revision.

The request budget applies to both text and the complete serialized JSON response including its trailing newline; it is not merely a per-document or text-only limit. Default65536, supported1024..1048576 bytes. Source count64 and per-reference-list32 are hard caps. Overflow fails without partial output. No timestamps, random IDs, absolute roots, resolved credentials, raw intake or runtime state are added. See [compiler](../docs/context.md) for selection, strict link handling, trust and privacy limits.
