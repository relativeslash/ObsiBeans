# ObsiBeans AI working guide

Canonical AI workflow entry point for this repository. Start with [[docs/Private/Contributing/Standards/README.md|shared standards]], then [[docs/Private/Contributing/README.md|ObsiBeans contributing guidance]] and [[docs/Private/Contributing/ObsiBeans project info.md|project information and compatibility baseline]].

Local standards notes are optional overrides, not a required parallel set of global standards. Their absence or empty content does not block work; inherit the shared rules. Follow the contributing entry point for the distinction between optional overrides and genuinely required guidance.

## Skills and local workflow

Load `protomatter-workspace` at session start and work in the epic clone it sets up, never in the primary checkout. Then load `protomatter-repo-navigation` and the task-relevant skills: `beans` for work tracking, `obsidian-cli` for live vault operations, and `obsidian-markdown` for note syntax.

The repository root is the `ObsiBeans` vault. Retain `docs/` in vault-relative documentation paths and explicitly target that vault.

Use the Beans skill to search for an existing task before creating work records and to keep them current. Read `.beans.yml` for tracking configuration rather than assuming a task directory or ID prefix. Keep design decisions in [[docs/Private/Design/ObsiBeans native workspace proposal.md|design documentation]] and link them from work records.

## V1 implementation entry point

The owner accepted the native workspace design as v1. Start with [[docs/Private/Tasks/OB-fgjv--obsibeans-v1-native-workspace.md|the v1 implementation milestone]] for scope, execution rules and the work index. Its explicit dependencies identify ready leaf tasks; epic and milestone records are completion gates, not standalone coding assignments.

## Plugin development

A plugin skeleton with quality gates exists: a workspace view, an open command and a settings tab, without Beans features. [[docs/Private/Contributing/ObsiBeans project info.md|Project information]] owns the toolchain pins, source layout, module boundaries and verified commands. Run `yarn install --immutable` once, then `yarn verify` before handing off any code change; it is what CI runs.

- Yarn uses Plug'n'Play, so there is no `node_modules`. Run Node scripts through Yarn (`yarn node file.ts` or a package script); plain `node` cannot resolve packages. Editors need Plug'n'Play support or Yarn's editor SDK.
- Put new production code under the layer directory that owns it. `yarn fitness` rejects files outside a layer, forbidden imports and import cycles. Change the rules only together with the design note's module boundaries.
- Route every UI string through `t()` with a new key in `src/views/messages.en.ts`. Never pass inline prose.
- Obsidian 1.14 renders settings from `getSettingDefinitions()`. `PluginSettingTab.display()` is deprecated, and lint rejects deprecated APIs.
- Headless tests get `obsidian` from `test/support/obsidian.ts`. Extend that stub only with API that production code uses. Use `bridge()` to cross between stub and real types instead of double assertions. Add `// @vitest-environment jsdom` to tests that render.
- `yarn typecheck` runs svelte-check, which checks both `.ts` and `.svelte` files and fails on Svelte accessibility warnings.
- The stub cannot prove real Obsidian behavior. After changing lifecycle, commands, views or settings, run `yarn test:native`. It needs a desktop session and runs a separate Obsidian instance, so the user's vaults are untouched.

## Beans backend

Before writing adapter, state, or view code, read [[docs/Private/Design/Beans 0.4.2 contract.md|the Beans 0.4.2 contract]]. The plugin depends on several non-obvious behaviors recorded there: queried ETags can be rejected, updates drop unknown frontmatter, GraphQL validates no field values, and blocking links are stored in two directions. For view and keyboard work, also read [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|the TUI parity matrix]]. Never run experiments against this repository's own tracker; the audit script shows how to use a temporary project.

Process and project binding live in `src/adapter/`: the plugin shell constructs one `ProcessRunner` and passes it to `bindProject`, `runBeans` and `scanTaskRoot`. Never call `child_process` elsewhere. Adapter tests use Node scripts as fake executables (`test/support/project.ts`) and need no Beans install; the release-binary tests need `OBSIBEANS_BEANS_RELEASE`, described in [[docs/Private/Contributing/ObsiBeans project info.md|project information]]. The plugin supports Beans 0.4.2 and also accepts a development build (reports `dev`), marked unverified; any other version is rejected. The executable must live outside the vault. The user trusts an executable explicitly in settings; trust is the file's real path plus a SHA-256 of its content, so replacing the file withdraws it.

## Growing this guide

Expand this guide as development produces verified knowledge: module entry points, debugging hints, Beans integration pitfalls, and release checks. Link to authoritative project information or focused guides rather than duplicating their rules and version tables.

Do not describe planned commands, modules, or integrations as implemented. Record unresolved design questions in design notes and track implementation work in Beans. The [[docs/README.md|documentation index]] provides the current starting points.
