# ObsiBeans AI working guide

Canonical AI workflow entry point for this repository. Start with [[docs/Private/Contributing/Standards/README.md|shared standards]], then [[docs/Private/Contributing/README.md|ObsiBeans contributing guidance]] and [[docs/Private/Contributing/ObsiBeans project info.md|project information and compatibility baseline]].

Local standards notes are optional overrides, not a required parallel set of global standards. Their absence or empty content does not block work; inherit the shared rules. Follow the contributing entry point for the distinction between optional overrides and genuinely required guidance.

## Skills and local workflow

Load `protomatter-repo-navigation` at session start, then the task-relevant skills: `beans` for work tracking, `obsidian-cli` for live vault operations, and `obsidian-markdown` for note syntax.

The repository root is the `ObsiBeans` vault. Retain `docs/` in vault-relative documentation paths and explicitly target that vault.

Use the Beans skill to search for an existing task before creating work records and to keep them current. Read `.beans.yml` for tracking configuration rather than assuming a task directory or ID prefix. Keep design decisions in [[docs/Private/Design/ObsiBeans native workspace proposal.md|design documentation]] and link them from work records.

## V1 implementation entry point

The owner accepted the native workspace design as v1. Start with [[docs/Private/Tasks/OB-fgjv--obsibeans-v1-native-workspace.md|the v1 implementation milestone]] for scope, execution rules and the work index. Its explicit dependencies identify ready leaf tasks; epic and milestone records are completion gates, not standalone coding assignments. The first leaves resolve open scope decisions and audit the selected Beans contract/TUI parity. No plugin or build toolchain was implemented by planning.

## Beans backend

Before writing adapter, state, or view code, read [[docs/Private/Design/Beans 0.4.2 contract.md|the Beans 0.4.2 contract]]. The plugin depends on several non-obvious behaviors recorded there: queried ETags can be rejected, updates drop unknown frontmatter, GraphQL validates no field values, and blocking links are stored in two directions. For view and keyboard work, also read [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|the TUI parity matrix]]. Never run experiments against this repository's own tracker; the audit script shows how to use a temporary project.

## Growing this guide

This guide currently establishes skills and navigation. Expand it as development produces verified knowledge: module entry points, setup and test workflows, plugin reload/debugging hints, Beans integration pitfalls, and release checks. Link to authoritative project information or focused guides rather than duplicating their rules and version tables.

Do not describe planned commands, modules, or integrations as implemented. Record unresolved design questions in design notes and track implementation work in Beans. The [[docs/README.md|documentation index]] provides the current starting points.
