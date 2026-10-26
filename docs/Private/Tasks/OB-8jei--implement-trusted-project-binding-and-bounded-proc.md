---
# OB-8jei
title: Implement trusted project binding and bounded process execution
status: todo
type: task
priority: high
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T02:37:27Z
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

- [ ] Validate config discovery, non-default task paths, path spaces, canonical/symlink traversal and missing/out-of-scope roots according to the scope decision.
- [ ] Model executable unavailable/untrusted, unsupported version/capability, invalid config and permission errors with actionable UI-ready diagnostics.
- [ ] Enforce timeouts, cancellation and output limits; release processes and listeners on cancellation, project switch and plugin unload.
- [ ] Cover Windows/macOS/Linux path/process behavior for declared supported OSes, or accurately restrict documented support to tested environments.

## Verification

Use fake process fixtures for injection strings, oversized/malformed output, hangs, nonzero exits and cancellation races; run real harmless queries against a disposable selected-version project. Assert no out-of-root file access or orphan processes.

## Handoff

Expose typed process/binding results and ownership/disposal contracts; record supported platforms and any unverified environment. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Follow the invocation rules in the [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]]: explicit `--config`, the config directory as working directory, `BEANS_PATH` removed, `--json` always. Treat non-bean Markdown files under the task root as invalid data.
