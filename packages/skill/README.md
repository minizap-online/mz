# MZ worker skill

[SKILL.md](SKILL.md) is the FR-011 thin worker entrypoint for the implemented MZ CLI/Core boundaries. It is self-contained and adds no domain implementation, tool permission, runtime writer or worker launcher. Supply this folder to the worker's existing skill harness; this repository does not automatically install it globally.

See [worker skill verification](../../docs/worker-skill.md) for interface availability, behavioral evidence and prerequisites. Context/recording knowledge in the skill must stay aligned with implemented interfaces as milestones advance.
