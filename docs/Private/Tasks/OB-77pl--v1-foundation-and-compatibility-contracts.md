---
# OB-77pl
title: V1 foundation and compatibility contracts
status: completed
type: epic
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:42Z
updated_at: 2026-10-26T19:20:10Z
parent: OB-fgjv
blocked_by:
    - OB-hup8
    - OB-f6ce
---

## Outcome

Resolve remaining v1 choices, audit the exact backend/TUI contract, and establish a reproducible plugin scaffold with executable quality gates.

Source: [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]]. Follow the execution rules in [[docs/Private/Tasks/OB-fgjv--obsibeans-v1-native-workspace.md|OB-fgjv — ObsiBeans v1 native workspace]]. This is a grouping and review record, not an independently executable coding task.

## Exit criteria

- [x] Every child is complete with acceptance and verification evidence.
- [x] Integrated behavior meets the design without unresolved safety defects; remaining scope decisions and limitations are documented.

Before completion, append a Summary of Changes linking child evidence.


## Work index

- [[docs/Private/Tasks/OB-wzgt--resolve-v1-scope-and-interaction-decisions.md|OB-wzgt — Resolve v1 scope and interaction decisions]]
- [[docs/Private/Tasks/OB-hup8--audit-beans-042-contracts-and-complete-the-tui-par.md|OB-hup8 — Audit Beans 0.4.2 contracts and complete the TUI parity matrix]]
- [[docs/Private/Tasks/OB-f6ce--scaffold-the-desktop-plugin-and-executable-quality.md|OB-f6ce — Scaffold the desktop plugin and executable quality gates]]
- [[docs/Private/Tasks/OB-jo2i--require-the-verify-check-on-main.md|OB-jo2i — Require the verify check on main]]

## Summary of Changes

All four children are complete; each records its own evidence in its Summary of Changes.

- [[docs/Private/Tasks/OB-wzgt--resolve-v1-scope-and-interaction-decisions.md|OB-wzgt]] resolved the v1 scope and interaction decisions in the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted design]].
- [[docs/Private/Tasks/OB-hup8--audit-beans-042-contracts-and-complete-the-tui-par.md|OB-hup8]] audited the Beans 0.4.2 release ([[docs/Private/Design/Beans 0.4.2 contract.md|contract]], [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|TUI parity matrix]]).
- [[docs/Private/Tasks/OB-f6ce--scaffold-the-desktop-plugin-and-executable-quality.md|OB-f6ce]] scaffolded the desktop plugin with headless quality gates, CI and the native smoke test.
- [[docs/Private/Tasks/OB-jo2i--require-the-verify-check-on-main.md|OB-jo2i]] made `verify` a required check on `main`.

The epic branch also published `.gitmodules` for the Standards submodule and routed agents through the `protomatter-workspace` skill in `AGENTS.md` and the AI working guide. Compatibility is a target, not tested support, as [[docs/Private/Contributing/ObsiBeans project info.md|project information]] states.
