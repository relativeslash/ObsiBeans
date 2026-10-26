---
# OB-8jei
title: Implement trusted project binding and bounded process execution
status: completed
type: task
priority: high
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T20:01:23Z
parent: OB-478m
blocked_by:
    - OB-wzgt
    - OB-hup8
    - OB-f6ce
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Architecture proposal; Reliability and accessibility requirements**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-wzgt--resolve-v1-scope-and-interaction-decisions.md|OB-wzgt — Resolve v1 scope and interaction decisions]]
- [[docs/Private/Tasks/OB-hup8--audit-beans-042-contracts-and-complete-the-tui-par.md|OB-hup8 — Audit Beans 0.4.2 contracts and complete the TUI parity matrix]]
- [[docs/Private/Tasks/OB-f6ce--scaffold-the-desktop-plugin-and-executable-quality.md|OB-f6ce — Scaffold the desktop plugin and executable quality gates]]

## Scope and boundaries

Implement settings-backed explicit executable confirmation and project/config binding, with safe task-root/path resolution. Execute only the selected executable with argument arrays and an explicit intended project directory. No shell-built commands, execution of note contents, auto-install, or silent repository-provided executable trust.

## Acceptance criteria

- [x] Validate config discovery, non-default task paths, path spaces, canonical/symlink traversal and missing/out-of-scope roots according to the scope decision.
- [x] Model executable unavailable/untrusted, unsupported version/capability, invalid config and permission errors with actionable UI-ready diagnostics.
- [x] Enforce timeouts, cancellation and output limits; release processes and listeners on cancellation, project switch and plugin unload.
- [x] Cover Windows/macOS/Linux path/process behavior for declared supported OSes, or accurately restrict documented support to tested environments.

## Verification

Use fake process fixtures for injection strings, oversized/malformed output, hangs, nonzero exits and cancellation races; run real harmless queries against a disposable selected-version project. Assert no out-of-root file access or orphan processes.

## Handoff

Expose typed process/binding results and ownership/disposal contracts; record supported platforms and any unverified environment. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Follow the invocation rules in the [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]]: explicit `--config`, the config directory as working directory, `BEANS_PATH` removed, `--json` always. Treat non-bean Markdown files under the task root as invalid data.

## Summary of Changes

Delivered the trusted process boundary of the adapter layer and its plugin wiring.

- `src/adapter/process.ts`: `runProcess` runs one process from an argument array (no shell) with an explicit environment, a deadline, a combined stdout/stderr limit and an abort signal. It stops with SIGTERM, then SIGKILL after 2 s, and settles only after the process exited and its pipes closed. It never rejects. `ProcessRunner` owns every process of the session: `cancelAll()` for project switches, `dispose()` for unload.
- `src/adapter/binding.ts`: `confirmExecutable` and `bindProject` check an absolute, real, executable, out-of-vault file; require the user's confirmation of its real path and SHA-256; resolve the config (default `.beans.yml` in the vault root, or an explicit vault-relative path), the task root (relative to the config directory), and Beans' `prefix`/`id_length`, rejecting anything whose real path leaves the vault; then probe `version` and accept only 0.4.2. `runBeans` applies the contract's invocation rules.
- `src/adapter/task-root.ts`: `scanTaskRoot` lists the task root without reading or following anything, reporting non-bean `.md` names, symbolic links and unreadable folders as invalid data, with a 50 000-entry bound.
- Plugin shell: stored settings, a settings tab with the executable, a Trust action, the config path and a live status row, a stale-result-safe `rebind`, and release of all processes on project change and unload. Diagnostics are typed values with English messages (`binding.*`).
- Documentation updated: contract note (Beans defaults when keys are absent, implemented rows), project information (layout, commands, platform scope), AI working guide.

Verification (Linux, Node 26.8.1, Obsidian 1.14.5):

- `yarn verify` passes: typecheck, lint, fitness (0 violations), 103 tests, coverage gates (adapter 100 % lines, 91 % branches).
- `yarn test:native` passes, including binding through Obsidian's real vault adapter and `parseYaml` against a fake Beans executable.
- `OBSIBEANS_BEANS_RELEASE=<audited 0.4.2 binary, SHA-256 verified> yarn vitest run test/adapter/beans-release.test.ts` passes (4 tests): real queries and creates in a disposable project, `BEANS_PATH` ignored, strays and symlinks reported, a malformed bean surfaces as `loading beans:`, cancellation leaves nothing running, and nothing outside the vault changed. Plain `yarn verify` skips these tests.
- Fake-process tests cover injection strings, malformed and oversized output, hangs, a process ignoring SIGTERM, non-zero exits and cancel/deadline races, and assert the child pid is gone.

Limitations:

- Only Linux was tested. Windows and macOS are documented as unsupported until run.
- A file swapped after the digest check and before the spawn would still run (marked `ponytail:` in `binding.ts`).
- `scanTaskRoot` checks names only. The empty-status check, duplicate IDs, custom-frontmatter blocking and mutation error classification belong to OB-41mc; the invalid-data and shared state belong to OB-os2h.
- Missing `beans.path` is treated as invalid configuration; Beans' own fallback for it was not established.
- The `go install` build of Beans reports `dev` and is rejected as unsupported by design.

Follow-up beans: none created.
