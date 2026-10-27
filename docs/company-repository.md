# Company repository loader

FR-002 exposes a read-only API in `@mz/core`. It locates private company knowledge and reads selected documents; it does not contact GitHub, load the whole handbook, write runtime state, resolve secrets, compile worker context, or activate projects. The CLI also provides [environment doctor](doctor.md); the loader remains read-only.

## Configure or discover

Selection uses this precedence:

1. `loadCompanyRepository({ directory })`.
2. `MZ_COMPANY_DIR` from the environment.
3. The nearest `company.yaml` in the current working directory or its ancestors.

Relative configured directories resolve against `cwd` (default `process.cwd()`). `env` defaults to `process.env`; callers may supply an environment mapping, including `{}` for deterministic discovery. Explicit selections do not fall back on failure. An invalid nearest marker also fails rather than selecting another company. Empty configured paths fail. Selected root paths are canonicalized; a root symlink is supported. A Git checkout is not required, so exported company directories also work.

## Company configuration v1

```yaml
schemaVersion: 1
id: example-company
name: Example Company
```

All keys are required and extra keys fail validation. IDs are lowercase ASCII slugs beginning with a letter, with a maximum length of 64 characters. Names are nonempty trimmed strings of at most 200 characters. The [JSON schema](../schemas/company-v1.schema.json) and [migration instructions](../schemas/migrations/001-company-config.md) describe this initial version. The loader rejects unsupported versions; it never edits or silently upgrades the directory.

## API

After `npm ci` and `npm run build`, an ESM consumer in the workspace can use:

```js
import { CompanyRepositoryError, loadCompanyRepository } from '@mz/core';

try {
  const company = await loadCompanyRepository({
    directory: './templates/company',
  });
  console.log(company.config.id);
  const role = await company.readMarkdown('roles/developer.md');
  const project = await company.readYaml(
    'projects/example-project/project.yaml',
  );
  // Use role.metadata, role.body, and project only within approved project scope.
} catch (error) {
  if (!(error instanceof CompanyRepositoryError)) throw error;
  console.error(
    error.code,
    error.path,
    error.field,
    error.line,
    error.column,
    error.message,
  );
}
```

`CompanyRepository` contains immutable `root` and `config` plus asynchronous `readYaml(relativePath)` and `readMarkdown(relativePath)` methods. Each method reads the requested file afresh. Returned metadata belongs to the caller and is not logged or persisted by Core. This library is not published as an npm release yet.

## Metadata and Markdown

YAML must contain a single mapping with string keys and finite JSON-compatible values. Empty/comment-only files return `{}`. YAML 1.2 booleans and scalars apply; duplicate keys, aliases, nonfinite numbers, unsupported tags, old YAML versions, unsafe object keys, and nesting beyond 32 levels fail. This validates metadata structure, not project activation or authority semantics. Do not put credential values in metadata or Markdown; use symbolic references when needed.

Markdown may start with optional YAML front matter:

```markdown
---
role: engineer
processes: [development, release]
---

# Role contract

Document the approved role here.
```

Front matter requires standalone `---` opening and closing lines. LF, CRLF, a leading UTF-8 BOM, and trailing spaces on delimiters are supported. An unterminated header fails. Without front matter, metadata is empty. Body text after the closing line is preserved exactly, including subsequent horizontal rules; only a leading BOM is removed from plain files. No Markdown rendering, evaluation, or instruction execution occurs.

## Paths, bounds, and errors

Documents must be UTF-8 regular files of at most 1 MiB. Absolute paths, paths escaping the company root, and document symlinks resolving outside it fail. Contained symlinks work. Checks reject accidental escapes; worker capability enforcement belongs to later Core work and must still surround access to this API.

`CompanyRepositoryError` exposes `code`, `path`, and optional `field`, `line`, and `column`. Source positions use one-based document lines/columns, including the opening front matter line. Messages omit offending values, source snippets, and raw parser/OS errors. Paths remain visible for diagnosis; consumers should treat company paths and returned content as private.

| Code                                      | Corrective action                                                 |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `COMPANY_NOT_FOUND`                       | Configure the company directory or run from within it.            |
| `INVALID_DIRECTORY`                       | Select an existing accessible directory.                          |
| `CONFIG_NOT_FOUND`                        | Add company.yaml to the selected directory.                       |
| `INVALID_CONFIG`                          | Correct the indicated field or remove unsupported fields.         |
| `UNSUPPORTED_SCHEMA_VERSION`              | Follow the schema migration instructions.                         |
| `INVALID_YAML`                            | Correct syntax, document count, duplicates, version, or tags.     |
| `INVALID_METADATA`                        | Use mapping metadata with supported keys/values and nesting.      |
| `INVALID_FRONT_MATTER`                    | Close the header with a standalone delimiter.                     |
| `INVALID_PATH`, `PATH_OUTSIDE_REPOSITORY` | Use a nonempty relative path contained in the company repository. |
| `FILE_NOT_FOUND`, `FILE_READ_ERROR`       | Check existence, permissions, and UTF-8 encoding.                 |
| `NOT_REGULAR_FILE`, `FILE_TOO_LARGE`      | Choose a regular file no larger than 1 MiB.                       |

Tests use temporary synthetic repositories and the generic starter. They never read private company configuration or credentials.
