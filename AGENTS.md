# ObsiBeans agent guide

The repository root is the Obsidian vault root (`ObsiBeans`); configuration lives in `.obsidian/`. `docs/` is the authoritative documentation subtree, not a separate vault.

Before repository work, read the `protomatter-workspace` skill first. Resolve or resume the epic/task clone under `AGENT_WORKSPACE` before any writes; subagents inherit the coordinator's verified execution context. Then read `protomatter-repo-navigation` and the task-relevant skills.

Read these entry points before working:

1. [Shared standards](docs/Private/Contributing/Standards/README.md) — entry point for coding, documentation, and engineering standards; follow its contextual-loading index.
2. [Contributing](docs/Private/Contributing/README.md) — how shared standards are inherited, optional project overrides, and the project compatibility baseline.
3. [AI working guide](docs/Private/Guides/ObsiBeans%20AI%20working%20guide.md) — skills and project workflow; expand with verified development hints as the project grows.

Global Protomatter standards apply by default. Local standards notes are optional and exist only for actual project differences; a missing or empty override note is not a blocker or a reason to create a duplicate standard. Required shared standards and explicitly required project contracts must still be available. See the contributing entry point for scope and precedence.

Vault-relative documentation paths retain the `docs/` prefix. Explicitly target the `ObsiBeans` vault for Obsidian automation.
