# Company starter

Copy into a separate private repository. Set `id` and `name` in `company.yaml`, retaining `schemaVersion: 1`. Core can load that marker and read YAML/Markdown metadata using the [company repository API](../../docs/company-repository.md).

The other files are manual knowledge scaffolding; their project/role/authority content is not a validated capability model or an authority grant. Replace placeholders through owner review. Keep credential values and raw operational logs out of Git. Existing M-00 starters can follow [migration 001](../../schemas/migrations/001-company-config.md).

After customizing this private starter, `mz context --role developer --task orientation` selects company context. `--project example-project --task review` selects the proposed project. These are planning examples; pending activation/capability review remains required. See [context source selection](../../docs/context.md) for required files/reference metadata.
