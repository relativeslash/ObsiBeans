# ObsiBeans project info

ObsiBeans is an Obsidian plugin project providing a native interface for Beans work tracking. See [[docs/Private/Design/ObsiBeans native workspace proposal.md]] for the accepted v1 target experience and [[docs/Private/Contributing/README.md]] for shared-standard inheritance. This note holds project facts and version selections, not copies of global standards.

## Compatibility baseline

Selected and checked on **2026-10-26 (UTC)**. “Latest” here means the latest public stable release available at selection time, excluding Catalyst/early-access and prerelease builds. These are fixed initial development targets, not floating requirements.

| Component | Selected baseline | Official evidence |
| --- | --- | --- |
| Obsidian Desktop | **1.14.5** | [Public desktop release, 2026-10-22](https://obsidian.md/changelog/2026-10-22-desktop-v1.14.5/); [official changelog](https://obsidian.md/changelog/) |
| Beans CLI | **0.4.2** (tag `v0.4.2`) | [Official v0.4.2 release](https://github.com/hmans/beans/releases/tag/v0.4.2), marked Latest in the [release listing](https://github.com/hmans/beans/releases) |

Obsidian 1.15.0 was listed as Catalyst early access when checked, so it is not the public-stable baseline. Beans main has development beyond v0.4.2; unreleased main is not the selected target.

The Beans release was audited on 2026-10-26. Its verified behavior, binary checksums, and adapter decisions are in [[docs/Private/Design/Beans 0.4.2 contract.md]]. To re-verify the release, run `test/contract/beans-0.4.2/audit.sh` from the repository root. It needs network access, and it passes when it ends with `PASS: Beans 0.4.2 contract holds`. A `go install` build reports version `dev` and is not the audited release binary.

### Meaning of compatibility

The plugin is intended to work with the selected pair above. Compatibility is a requirement to implement and test, **not a claim of already tested support**. The only plugin test on Obsidian so far is the native smoke test of the skeleton (load, open, settings, unload and reload on 1.14.5, Linux). Older versions, future versions, and Obsidian Mobile are not included in this initial target by implication.

The design currently proposes desktop execution of the local Beans CLI. The baseline does not install or upgrade either application. A developer's installed version is evidence about that machine, not a substitute for this selection.

Before releasing a plugin, verify the Beans CLI/GraphQL contract and native Obsidian workflows on this pair. `manifest.json` declares `minAppVersion` 1.14.5 and `isDesktopOnly`.

### Changes to the baseline

Review upstream release notes before changing these exact targets. Update this note, applicable dependency/manifest pins, and compatibility tests together. Record the selection date, sources, actual test results, and any changed support scope. Do not silently move the baseline whenever upstream publishes a new version.

## Toolchain

Selected and checked on **2026-10-26 (UTC)** under `ENG-BUILD-002`. Unless the evidence column says otherwise, the pin was the npm `latest` dist-tag on that date. Exact pins live in the default Yarn catalog in `.yarnrc.yml`; `yarn.lock` pins the resolved graph.

| Component | Pin | Role | Selection evidence |
| --- | --- | --- | --- |
| Node.js | CI 24.22.1; `engines` `^24.22.1 \|\| ^26.8.1` | Tooling runtime | Latest release of the 24 LTS line (Krypton). Obsidian's Electron runs Node 24, so CI uses the same major. 26.8.1 is verified locally; Node 26 was not yet LTS. |
| Yarn | 4.18.1 | Package manager | Latest stable. Committed as `.yarn/releases/yarn-4.18.1.cjs` (`yarnPath`, SHA-256 `a28ad591…970907e`) and `packageManager`, so any global Yarn or Corepack runs this version. |
| TypeScript | 6.0.3 | Type checking | Latest 6.x. **7.0.2 is latest but rejected**: typescript-eslint 8.72.0 requires `<6.1.0`, svelte-check 4.7.7 requires `^5 \|\| ^6`, and 7.0 exposes only `unstable/*` programmatic APIs. Review when both peers accept 7. |
| Svelte | 5.57.2 | View components | Design decision; latest. Bundled into `main.js`. |
| @sveltejs/vite-plugin-svelte | 7.3.1 | Svelte compile for build and tests | Latest; peers Vite 8 and Svelte ≥5.46.4. |
| Vite | 8.3.5 | Bundler | Latest. One Svelte plugin serves both the build and Vitest. |
| Vitest, @vitest/coverage-v8 | 5.0.5 | Unit/integration tests, V8 coverage | Latest. |
| jsdom | 30.1.3 | DOM for view tests | Latest. |
| svelte-check | 4.7.7 | Type checker for `.ts` and `.svelte` | Latest. `tsc` alone cannot resolve `.svelte` imports. |
| ESLint, @eslint/js | 10.13.0, 10.0.1 | Lint | Latest. |
| typescript-eslint | 8.72.0 | `strictTypeChecked` rules | Latest. |
| obsidian | 1.14.4 | API type declarations | Newest published; no 1.14.5 package exists. The runtime target stays 1.14.5. |
| @codemirror/state, @codemirror/view | 6.7.6, 6.43.13 | Peers of `obsidian` | Exact versions required by obsidian 1.14.4. Types only; externalized from the bundle. |
| @types/node | 24.19.2 | Node API types | Newest 24.x, matching the Node 24.20.0 inside Obsidian's Electron. 26.x would type APIs missing at runtime. |
| intl-messageformat | 12.1.4 | ICU MessageFormat formatter | Owner decision on 2026-10-26 for the localization API; latest. |

Rejected: `eslint-plugin-obsidianmd` 0.4.2 requires exactly `obsidian` 1.8.7 and ESLint 9. Revisit when it supports the baseline.

Observed runtime on 2026-10-26 (Linux, installer 1.13.7): Electron 43.6.0, Chrome 150, Node 24.20.0. The app package update to 1.14.5 does not change Electron. The bundle targets ES2024.

Yarn settings in `.yarnrc.yml`: `nodeLinker: node-modules` so Vite, svelte-check and editors resolve packages without Plug'n'Play SDKs; `enableScripts: false` because no dependency needs an install script; telemetry off. `yarn.config.cjs` constraints require every dependency to use `catalog:`.

Upgrades follow `ENG-BUILD-003`: change the catalog entry, run `yarn install`, run `yarn verify`, and update this table in the same change. Yarn 4.18.1 was installed with `yarn set version 4.18.1 --yarn-path`.

## Source layout and module boundaries

| Path | Holds |
| --- | --- |
| `src/plugin/` | Plugin shell: `main.ts` (bundle entry), settings tab, command and view registration |
| `src/views/` | `ItemView` hosts, Svelte components, the localization API (`i18n.ts`) and English catalog (`messages.en.ts`) |
| `src/state/` | Application state and actions (not created yet) |
| `src/adapter/` | Beans process adapter (not created yet) |
| `test/<layer>/` | Headless tests per layer; `test/tools/` tests the gates |
| `test/support/obsidian.ts` | Runtime stand-in for the `obsidian` module in tests, plus `bridge()` for the compile-time type cast |
| `test/native/smoke.ts` | Native-window smoke test |
| `test/contract/beans-0.4.2/` | Beans contract audit script and snapshots |
| `tools/` | Type-size, architecture and changed-coverage gates |

The layer rules come from the design's [[docs/Private/Design/ObsiBeans native workspace proposal.md#Module boundaries|module boundaries]]. `LAYERS` in `tools/architecture.ts` is their executable definition, including each layer's allowed packages. Two interpretations are encoded there. State may import the adapter only with `import type`, because the design allows "adapter interfaces"; the shell constructs and injects the adapter. Views may use `obsidian`, `svelte` and `intl-messageformat`; the shell may use `obsidian`. Every file under `src/` must belong to a layer, and import cycles fail.

## Commands

All commands run from the repository root and were verified on 2026-10-26.

| Purpose | Command |
| --- | --- |
| Install (required first on a fresh checkout) | `yarn install --immutable` |
| All headless gates, as in CI | `yarn verify` |
| Lockfile, catalog constraints, duplicate check | `yarn deps` |
| Type check (`.ts` and `.svelte`, warnings fail) | `yarn typecheck` |
| Lint | `yarn lint` |
| Type-size and architecture gates | `yarn fitness` |
| Tests without coverage | `yarn test` |
| Tests with per-module and changed-line coverage | `yarn coverage` |
| Development bundle in `dist/` | `yarn build` |
| Native-window smoke test (builds first) | `yarn test:native` |

`yarn build` writes `dist/main.js` (CommonJS, unminified, inline source map) and would add `dist/styles.css` when components declare styles. Two builds produce identical bytes, also across Node 24 and 26. Release packaging is not set up; it belongs to the packaging task.

`yarn test:native` needs a desktop session. It copies `dist/` and `manifest.json` into a disposable vault and starts a separate Obsidian instance with its own profile and runtime directories, so a running Obsidian, its vaults and its CLI socket are untouched; the test fails if that socket changes. It drives that instance over the Chrome DevTools Protocol, then stops the process group and deletes the sandbox. `OBSIDIAN_BIN` sets the launcher (default `obsidian`) and `OBSIDIAN_ASAR` the app package of the target version (default `~/.config/obsidian/obsidian-1.14.5.asar`, which Obsidian downloads when it updates). It fails unless the app reports exactly `minAppVersion`.

The changed-line gate compares against `COVERAGE_BASE` or its first argument; otherwise against the merge base with the upstream branch, including uncommitted and untracked files. `none`, or an all-zero commit, means no base: all production code counts as new. CI passes the pull request base or the previous commit of a push.

## Quality gates

Coverage uses the inherited defaults of `ENG-TEST-001`; no threshold override exists. `vite.config.ts` derives one threshold per layer from `LAYERS`, plus the aggregate. The coverage scope is `src/**/*.{ts,svelte}`, which includes files no test loads; tests and tools are outside it, and there are no other exclusions. `tools/changed-coverage.ts` applies the same minimums to changed lines and branches per layer, and fails when a changed production file has no coverage data.

`tools/type-size.ts` measures every class, interface, enum and type alias under `src/`, `test/`, `tools/` and top-level build configuration, including types inside Svelte `<script>` blocks. A Svelte component is not a type under the counting contract, so `TSE-DES-001` review covers component size. Approved exceptions go in `SIZE_EXCEPTIONS` and architecture exceptions in `ARCHITECTURE_EXCEPTIONS`; both lists are empty.

ESLint applies `strictTypeChecked` to TypeScript and JavaScript. Svelte markup is checked by svelte-check, whose accessibility warnings fail the type check. Native-window tests and the contract audit are separate from `yarn verify`; no benchmarks exist yet.

`.github/workflows/ci.yml` runs install, `yarn verify` and `yarn build` on Node 24.22.1 for pushes to `main` and for pull requests. Actions are pinned by commit.

## Selected standard profiles

TypeScript baseline everywhere. `Typescript/browser` applies to `src/`, which runs in Obsidian's Electron renderer. `Typescript/node` applies to `src/adapter/` (process execution) and to `tools/` and `test/native/` (Node scripts). The `web-app` profile does not apply: the design rules out a standalone web-app stack.

## Localization

Declared under `LOC-TEXT-005` by owner decision on 2026-10-26:

- English (`en`) is the default and only supported locale. The system locale is ignored, including for number formatting.
- Messages live in `src/views/messages.en.ts` as localized keys mapped to ICU MessageFormat patterns. It is a TypeScript module, not a JSON asset; keys are checked at compile time.
- `t(key, values)` in `src/views/i18n.ts` formats with intl-messageformat 12.1.4. There is no fallback chain or locale-pack overlay.
- A missing message, a malformed pattern, missing arguments or rich-text output return the raw key and log one console warning per key.

## Development guidance

[[docs/Private/Guides/ObsiBeans AI working guide.md]] is the canonical AI workflow entry point.
