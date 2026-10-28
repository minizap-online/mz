# Start using MZ

MZ separates technical connection from company context. You prepare the installation once, then steer through conversations. You do not need runtime paths, actor UUIDs or commands for individual developers.

```sh
mz init
mz guide
mz ask
```

## Init connects the installation

Run `mz init` in your devbox terminal. Choose a company directory and either an existing company Git repository or a new local company shell. The default checkout is `~/.local/share/mz/company`. Technical organization slug/display-name prompts appear only when a company marker does not exist.

For the existing MiniZap company repository, you can supply its URL directly:

```sh
mz init --repository https://github.com/minizap-online/company.git
```

When credentials are missing, interactive setup can open GitHub's browser sign-in through `gh` and Codex's own sign-in. MZ never asks you to paste a key into company context. The host needs Git, Codex and, for that optional GitHub sign-in, GitHub CLI. Existing provider authentication is reused. A provider login cancellation/failure is not a completed connection; rerun init or follow the reported provider action.

Init creates a minimal company shell, local runtime/source/session storage outside Git, and private saved settings. Existing company documents are preserved, not replaced by examples. There is no example project to mistake for a real activated project. Existing compatible setup is validated and reused; missing or conflicting storage is reported instead of silently reset. No model is invoked by init.

Settings live at `~/.config/mz/config.json`; local pilot runtime lives under `~/.local/state/mz/`. XDG directory settings and `MZ_CONFIG_FILE` are supported. Init creates private files/directories and restricts an attached company checkout's root to its owner/root. This devbox runtime is a local pilot workspace; authoritative server hosting and deployed recovery are separate operational work.

## Guide gathers company context

Run `mz guide`. It opens the configured Codex conversation with the MZ setup assignment. Company purpose, devbox, existing infrastructure, workflows, how involved you want to be, and the first project are discussed there, one topic at a time. Existing company knowledge is supplied first so you can refine it rather than repeat it.

Ask the guide to save accepted answers as you go. It is instructed to maintain `ONBOARDING.md` with accepted facts, unanswered questions and the next action, and to update the relevant company documents. A fresh guide invocation reads those files. Codex owns its own chat transcript; MZ continuity relies on the actual saved company knowledge, not a promise to remember the chat.

For the first company website, describe what you want when the guide reaches the first-project discussion. It can prepare a candidate brief, initial developer role/team proposal and the context files needed for a project steward. It must keep unknown facts explicit. Creating a candidate or a role file does not claim a developer has started or a project has been activated.

The launch follows the [official Codex CLI command reference](https://learn.chatgpt.com/docs/developer-commands) and [approval documentation](https://learn.chatgpt.com/docs/agent-approvals-security): Codex runs with workspace-write permissions and on-request approvals. It uses your existing login/model configuration and may consume your configured account's usage. This interactive session is a trusted host operator that can edit company knowledge; it is different from MZ's tool-free structured API worker. It is not given automatic write access to the separate runtime directory or a sandbox-bypass flag. Applicable scope/approval still governs external actions, new spending and publication. No new model/backend is silently selected.

## Ask is the ongoing owner conversation

Run `mz ask` to discuss the company, give more context or ask what to do next. An initial question can be included:

```sh
mz ask "What company context is still missing?"
mz ask --project company-website
```

Use the actual project slug saved by the guide. A project conversation needs its curated project files and `projects/ID/tasks/steward.md`; the guide assignment describes that scaffold. `--read-only` is available for an ask conversation that should not edit knowledge. If you stop and return later, run ask/guide again: current curated context/status is prepared afresh. A session exit records run history, not automatic proof that setup, decisions or project work are complete.

General worker scheduling and live GitHub domain-provider automation are not supplied by this onboarding change. The steward can use available authorized host tools and existing MZ primitives, keeping actual outcomes distinct from proposals. Missing automation should be captured while continuing the real project; it should not turn onboarding into a new infrastructure project.

## The lower-level commands remain available

Saved settings also remove repeated setup from ordinary commands:

```sh
mz status
mz ingest idea.md
mz inbox list
```

Explicit flags override environment values, which override saved settings. Selecting another company explicitly does not automatically borrow this company's saved runtime/storage. Read-only status/inbox/doctor commands still do not initialize a missing database. Doctor may report unavailable live integration/backup checks even after successful local initialization.

For skills and automation, `mz guide --print` and `mz ask --print` emit the bounded private assignment without invoking Codex or appending run history. Keep that output private. Noninteractive init supports explicit options with `--yes`; it never initiates an interactive login.

The existing `mz ask FILE --role ROLE --task TASK ... --json` interface remains the tool-free OpenAI API request/validated response/handover path. Use `mz ask --api-help` for its model/token/secret configuration. An interactive Codex run does not fabricate that API response or a decision approval. See [steward contracts](steward.md) and [worker guidance](worker-skill.md).

## Installing and updating this development checkout

The devbox installation is a launcher linked to this built MZ checkout, not a published npm package. Maintainers install it with:

```sh
npm ci
npm run install:local
```

This builds MZ and creates `~/.local/bin/mz`, refusing to replace an unrelated command. Keep the checkout available, put `~/.local/bin` on PATH if needed, and rebuild after updates. Installation alone does not initialize a company or answer any onboarding questions for you. The longer [test plan](test-plan.md) remains a maintainer regression/fixture walkthrough; it is not the normal first-use path.
