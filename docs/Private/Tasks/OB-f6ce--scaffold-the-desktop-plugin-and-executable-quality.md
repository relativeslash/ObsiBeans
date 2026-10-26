---
# OB-f6ce
title: Scaffold the desktop plugin and executable quality gates
status: in-progress
type: task
priority: high
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T09:27:26Z
parent: OB-77pl
blocked_by:
    - OB-wzgt
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Architecture proposal; Reliability and accessibility requirements**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-wzgt--resolve-v1-scope-and-interaction-decisions.md|OB-wzgt — Resolve v1 scope and interaction decisions]]

## Scope and boundaries

Create the minimal TypeScript Obsidian plugin project, build/test structure and dependency boundaries selected by the scope task. Pin a verified stable Yarn/toolchain and compatible API dependencies under Engineering/Build and Dependencies; do not silently upgrade the fixed product baseline. Do not introduce placeholder standards notes or copy shared rules.

## Acceptance criteria

- [ ] Document exact Node/Yarn/API/build/test versions and selection evidence in project information; commit one Yarn lockfile, catalogs and enforcing constraints.
- [x] Provide desktop-only manifest, native view/command/settings lifecycle skeleton and a reproducible development bundle that loads and unloads on the target Obsidian version.
- [ ] Provide headless type, lint, unit/integration, coverage, dependency and type-size/architecture fitness gates in required CI; validate the gates fail on representative violations.
- [x] Apply inherited per-module and changed-code coverage defaults; initial production code counts as new. Separate native-window tests, benchmarks and release packaging from normal headless checks.
- [x] Record actual setup, test, build and reload commands in project information/AI guide, with production code and test fixture locations.

## Verification

Run fresh deterministic install, configured headless checks and bundle creation; load/reload the minimal plugin in a disposable target-version vault and inspect runtime errors. Do not invent command names in documentation before verifying them.

## Handoff

Hand off the working skeleton, declared module boundaries, test helpers and actual CI/local commands. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.


## Summary of Changes

Scaffolded the desktop plugin and its quality gates. Toolchain, versions, selection evidence, layout, layers, commands and gates are recorded in [[docs/Private/Contributing/ObsiBeans project info.md|project information]]; plugin-development hints are in the [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]].

- Toolchain: Node 24.22.1 (CI) or 26.8.1, Yarn 4.18.1 via `yarnPath`, one `yarn.lock`, a catalog in `.yarnrc.yml`, and `yarn.config.cjs` constraints requiring `catalog:` for every dependency. TypeScript 6.0.3 (7.0 rejected: typescript-eslint and svelte-check do not support it), Svelte 5.57.2, Vite 8.3.5, Vitest 5.0.5, ESLint 10 with typescript-eslint `strictTypeChecked`, obsidian typings 1.14.4.
- Skeleton: `manifest.json` (desktop-only, `minAppVersion` 1.14.5); `src/plugin` (lifecycle, command, declarative settings tab); `src/views` (Svelte workspace in an `ItemView`, typed English catalog with ICU formatting via `intl-messageformat`); empty `src/state` and `src/adapter` layers declared in `tools/architecture.ts`.
- Gates: `yarn verify` runs dependency integrity, svelte-check, ESLint, type-size and architecture fitness tools, and Vitest coverage with per-layer and changed-line thresholds. `.github/workflows/ci.yml` runs install, verify and build on pushes to main and on pull requests.
- Test helpers: `test/support/obsidian.ts` (Obsidian API stub aliased in Vitest), fixture tests for every tool under `test/tools`, and the isolated native smoke test `test/native/smoke.ts` (`yarn test:native`), kept out of the headless checks.

Results:

- `yarn verify` passes: 30 tests; changed-line coverage against the current base is plugin lines 10/10 and branches 2/2, views lines 27/27 and branches 9/11; 28 types measured with no warnings; 0 architecture violations.
- A fresh copy with Node 24.22.1 and an empty Yarn cache installed with `--immutable`, verified and built; its `dist/main.js` is byte-identical to the local build (sha256 `d5acf87a…`).
- Each gate failed (exit 1) on an injected violation: TypeScript error, Svelte accessibility warning, lint `any`, forbidden layer import, 500-line type, coverage threshold, uncovered changed lines, non-catalog dependency and lockfile drift.
- `yarn test:native` on an isolated Obsidian 1.14.5 passes: version, load, open and reuse of the workspace tab, settings tab rendering, unload with unmount, reload, no plugin runtime errors, and the running Obsidian's CLI socket left untouched. An injected plugin exception made it fail.

Limitations and open items:

- Nothing is committed or pushed yet, so the lockfile is not committed and CI has not run on GitHub. Making the CI check required needs a branch-protection setting on `relativeslash/ObsiBeans`, which only the repository owner can enable.
- Only Linux was tested. Svelte component scripts are architecture-checked, but their markup is not measured by the type-size tool. No benchmarks or release packaging exist yet; they belong to later beans.
- An early native smoke run, before runtime-directory isolation was added, replaced the running Obsidian's CLI socket; restarting Obsidian or toggling its CLI setting restores the `obsidian` CLI.
