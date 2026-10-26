---
# OB-77pl
title: V1 foundation and compatibility contracts
status: in-progress
type: epic
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:42Z
updated_at: 2026-10-26T19:09:52Z
parent: OB-fgjv
blocked_by:
    - OB-hup8
    - OB-f6ce
---

## Outcome

Resolve remaining v1 choices, audit the exact backend/TUI contract, and establish a reproducible plugin scaffold with executable quality gates.

Source: [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]]. Follow the execution rules in [[docs/Private/Tasks/OB-fgjv--obsibeans-v1-native-workspace.md|OB-fgjv — ObsiBeans v1 native workspace]]. This is a grouping and review record, not an independently executable coding task.

## Exit criteria

- [ ] Every child is complete with acceptance and verification evidence.
- [ ] Integrated behavior meets the design without unresolved safety defects; remaining scope decisions and limitations are documented.

Before completion, append a Summary of Changes linking child evidence.


## Work index

- [[docs/Private/Tasks/OB-wzgt--resolve-v1-scope-and-interaction-decisions.md|OB-wzgt — Resolve v1 scope and interaction decisions]]
- [[docs/Private/Tasks/OB-hup8--audit-beans-042-contracts-and-complete-the-tui-par.md|OB-hup8 — Audit Beans 0.4.2 contracts and complete the TUI parity matrix]]
- [[docs/Private/Tasks/OB-f6ce--scaffold-the-desktop-plugin-and-executable-quality.md|OB-f6ce — Scaffold the desktop plugin and executable quality gates]]
- [[docs/Private/Tasks/OB-jo2i--require-the-verify-check-on-main.md|OB-jo2i — Require the verify check on main]]
