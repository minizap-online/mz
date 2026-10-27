# FR-002 Company repository loader

## Intent and scope

Implement MZ-002 as a read-only Core library so later doctor/context work can use private organization knowledge without vendor-specific assumptions. The owner authorized FR-002 on 2026-10-27. Routine API and format choices below are implementation decisions, not pre-existing requirements.

No GitHub operations, secret resolution, runtime database, context selection, project activation, or new CLI command is included.

## Approach

Use a small filesystem adapter plus one YAML parser. An explicit directory is predictable but insufficient for convenient discovery; Git-only discovery would unnecessarily reject exported directories and synthetic fixtures. Select a `company.yaml` marker with explicit-directory, environment, and ancestor discovery precedence. Keep Markdown body text intact instead of interpreting it or loading the entire repository.

Use the existing strict ESM TypeScript stack and the `yaml` package. No Markdown renderer or general configuration framework is needed.

## Contract

`loadCompanyRepository(options?: CompanyRepositoryOptions): Promise<CompanyRepository>` locates and validates a repository. Options: `directory?: string`, `cwd?: string`, `env?: Readonly<Record<string, string | undefined>>`. Defaults are process cwd/environment. A relative configured directory resolves against cwd. Explicit directory wins over `MZ_COMPANY_DIR`; otherwise search cwd and its ancestors for `company.yaml`. An explicitly configured invalid path is an error, never a fallback. The nearest marker wins even when its content is invalid. A directory need not have `.git`.

The returned object has canonical `root`, validated `config`, `readYaml(relativePath)` and `readMarkdown(relativePath)`. These methods read only the requested file. Absolute paths, traversal outside the root, and symlinks resolving outside it are rejected. Paths may traverse directories within the root. Files must be regular files, at most 1 MiB each. This path validation does not implement future worker capability enforcement.

The first company schema is `schemas/company-v1.schema.json`:

```yaml
schemaVersion: 1
id: example-company
name: Example Company
```

All three keys are required; additional keys fail. IDs are lowercase ASCII slugs beginning with a letter, up to 64 characters; names are nonempty trimmed strings, up to 200 characters. Unsupported versions fail with a migration instruction. `schemas/migrations/001-company-config.md` explains migrating the previous manual-only scaffolding; no prior parsed schema or runtime database exists.

YAML metadata must be a single mapping with string keys and JSON-compatible finite values. Reject duplicate keys, non-mapping roots, aliases, unsupported tags, excessive nesting (over 32 levels), and unsafe object keys (`__proto__`, `constructor`, `prototype`). Empty/comment-only metadata maps to an empty mapping. Strict YAML 1.2 is used; inputs declaring older YAML versions fail. Parser diagnostics never include source excerpts or offending values.

Markdown optionally starts with a YAML front matter block delimited by standalone `---` lines. Accept LF/CRLF, a leading UTF-8 BOM, and trailing spaces on delimiters. A missing closing delimiter fails. Preserve all body text after the closing delimiter; a plain Markdown file returns empty metadata and its body unchanged except a leading BOM. Empty front matter is valid. Body horizontal rules are not metadata. No Markdown rendering or execution occurs.

Errors use `CompanyRepositoryError` with a stable `code`, source path, and optional field/line/column. Messages identify corrective action but do not echo input values, parser messages, or file content. Metadata returned to the caller is private data; the loader does not log, persist, or publish it.

## Validation

Use temporary synthetic repositories only. Cover precedence, ancestor discovery, invalid marker/config cases, schema versions, syntax errors and redacted diagnostics, front matter/body preservation, path and symlink escapes, file size/type bounds, YAML aliases/tags/duplicates, and clean installation. Existing CLI tests must continue to pass without company config. An independent reviewer checks the finished change.
