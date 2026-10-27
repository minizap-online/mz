# Schemas

[company-v1.schema.json](company-v1.schema.json) defines the first parsed company configuration, implemented by FR-002. [Migration 001](migrations/001-company-config.md) describes adding it to the previous manual-only starter.

Core validates the same contract directly with actionable, source-safe errors. Generic YAML and Markdown front matter are mapping metadata, not approved role, capability, or project schemas. Each future schema change must document its compatibility and migration. No SQLite schema exists yet.
