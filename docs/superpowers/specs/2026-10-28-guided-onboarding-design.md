# Guided MZ onboarding

## Intent and chosen approach

The owner chose a small `mz init` first, followed by company context through MZ itself, and selected a company website as the real pilot. No company-purpose/devbox/workflow/website questions are asked in this implementation chat. Their answers must be collected by the installed tool. This authorizes the onboarding implementation; it does not authorize inventing organization facts, paid infrastructure or project activation.

Approaches considered: manual Codex-assisted bootstrap would ship sooner but leaves the owner handling internal setup; fully autonomous provisioning would require unproven infrastructure/worker execution. The selected approach is technical init plus a Codex-backed guided owner conversation. Keep the CLI as the stable interface for skills/automation and reuse the existing primitives. No generalized scheduler/browser is introduced.

## User journey

1. Local installer links an `mz` launcher to this built checkout in ~/.local/bin. It works from another directory; no private workspace package is published.
2. `mz init`: prompt only for a company directory and optional existing Git repository, organization slug/name when needed. Create a minimal compilable shell without an example project, preserve existing documents, create private config and external local runtime/source/session directories and assigned local identities. Probe Codex version/login status without reading its secrets. Missing login gives a clear Codex-owned sign-in route; MZ never asks for a key value. Print `mz guide` as the next step.
3. `mz guide`: start an interactive Codex session with selected company context and a dedicated setup assignment. Ask one question at a time about company purpose, devbox, workflow, owner involvement and first project. Read existing knowledge before asking. Save accepted facts and outstanding questions in company knowledge and ONBOARDING.md after each useful step. Include a starter developer role; discuss additional team needs through the guide. Preserve activation as an explicit human decision rather than inferred permission.
4. `mz ask [--project ID] [QUESTION...]`: start a Codex steward conversation with saved company/runtime settings and compiled scope/status. No path or actor flags are required. Repeated invocations compile current durable knowledge rather than requiring the original chat. Existing explicit FILE/role/task structured API invocation remains available, with its stricter tool-free contract unchanged.

## Boundaries and files

Core owns local-installation config and company-shell initialization. Settings use schemaVersion1, absolute company/runtime/source/artifact paths, generated actor/worker UUIDs and backend codex. Default location is the user's XDG config directory/mz/config.json (MZ_CONFIG_FILE override). Runtime/storage lives under XDG state directory/mz outside Git. Config/directories are private, bounded, no links; writes are exclusive/atomic. No secret values or company prose are settings fields. Existing config reruns validate and report the existing installation; they do not reset it. No implicit database migration from status/read commands.

Explicit CLI flags override existing environment values, which override saved installation defaults. Help/version require no setup or Codex. Saved defaults apply to implemented commands without modifying process.env globally. Invalid saved config fails safely rather than silently selecting another company.

A new company shell supplies company.yaml, COMPANY.md, AUTHORITY.md, DEVBOX.md, ASSETS.md, security-baseline policy, intake process, developer/steward role and dedicated setup/steward tasks. Existing files are preserved; incompatible selected identities fail instead of overwriting owner facts. The shell's marker identity is technical metadata, not organizational context or an authority grant. A Git remote may be cloned through existing Git credentials; MZ does not extract tokens from repositories or persist authenticated URLs. Git errors are source-safe. Existing nonempty destinations are never replaced.

The interactive Codex adapter uses fixed executable/argv (no shell), selected company working directory, workspace-write and on-request approvals, a small argv pointing to a private prepared assignment file, and inherited terminal IO. Context/question prose is in a private bounded file rather than argv. It reuses the user's Codex configuration/authentication; no default model/key is invented. This is a trusted host operator, not the tool-free neutral advisory worker: it may edit company knowledge and use host tools subject to Codex policy. Sandbox read permissions are not claimed as company isolation. It is never granted a danger-full-access flag or automatic write access to the state directory. No broad state/secret port is passed to the model.

The host records a plain run.started/run.finished lifecycle for interactive session exit, not a fabricated structured steward response or approved decision. Codex owns its own transcript; curated company notes provide MZ continuity. A successful process exit is not proof that onboarding/project work is complete. The existing API ask continues to provide validated private response/handover and interaction references. Document the distinction explicitly.

## Verification and limits

Tests cover new/attached company, idempotence/conflicts, private settings/storage, saved-default precedence, command help and non-TTY recovery, actual argv/stdin/terminal dispatch with synthetic Codex, compileable setup/steward contexts, process success/failure and structural-only audit, separate API compatibility, link/no-overwrite/byte/path rejection, installer from unrelated cwd, and missing authentication diagnostics. No real model call runs in development. Install the verified launcher but leave actual `mz init`/context collection to the owner so the unknown-user experience is preserved.

This local pilot setup is not authoritative server hosting, deployed backup, GitHub domain integration or automatic worker execution. The guide captures what is needed for those decisions rather than inventing answers or stopping the pilot to build future automation.
