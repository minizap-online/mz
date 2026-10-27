# Migration 001: manual starter to company schema v1

FR-002 introduces the first parsed company configuration. M-00 had only manual Markdown scaffolding and an unversioned illustrative project.yaml; there is no previous parsed company schema or database migration to run.

In a separate private company repository:

1. Add `company.yaml` at the repository root using `templates/company/company.yaml` as the source.
2. Set `schemaVersion: 1`, a lowercase company `id`, and a trimmed display `name`. Keep actual company values private.
3. Leave existing Markdown, roles, processes, policies, and project files intact. Front matter is optional; no bulk conversion is required. The existing example project.yaml is generic metadata, not the company configuration.
4. Load the directory through Core using the API in [company repository documentation](../../docs/company-repository.md). Address reported fields before depending on the result.

This is a manual, reversible migration: removing the new marker restores manual-only use. The loader never rewrites files or migrates silently. It rejects unsupported versions with `UNSUPPORTED_SCHEMA_VERSION`.

Every future company schema change must define its version compatibility and an explicit migration here. Runtime SQLite migrations belong to FR-003, not this schema baseline. This migration grants no authority and activates no project.
