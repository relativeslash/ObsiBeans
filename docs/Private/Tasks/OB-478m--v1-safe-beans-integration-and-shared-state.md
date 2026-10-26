---
# OB-478m
title: V1 safe Beans integration and shared state
status: completed
type: epic
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:42Z
updated_at: 2026-10-26T22:31:27Z
parent: OB-fgjv
blocked_by:
    - OB-os2h
---

## Outcome

Build the trusted process boundary, validated read/write adapter, conflict and preservation policy, and shared lifecycle-managed state.

Source: [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]]. Follow the execution rules in [[docs/Private/Tasks/OB-fgjv--obsibeans-v1-native-workspace.md|OB-fgjv — ObsiBeans v1 native workspace]]. This is a grouping and review record, not an independently executable coding task.

## Exit criteria

- [x] Every child is complete with acceptance and verification evidence.
- [x] Integrated behavior meets the design without unresolved safety defects; remaining scope decisions and limitations are documented.

Before completion, append a Summary of Changes linking child evidence.


## Work index

- [[docs/Private/Tasks/OB-8jei--implement-trusted-project-binding-and-bounded-proc.md|OB-8jei — Implement trusted project binding and bounded process execution]]
- [[docs/Private/Tasks/OB-41mc--implement-validated-beans-reads-and-conflict-safe.md|OB-41mc — Implement validated Beans reads and conflict-safe mutations]]
- [[docs/Private/Tasks/OB-os2h--implement-shared-query-state-refresh-and-recoverab.md|OB-os2h — Implement shared query state, refresh and recoverable drafts]]

## Summary of Changes

All three children are complete with acceptance and verification evidence: [[docs/Private/Tasks/OB-8jei--implement-trusted-project-binding-and-bounded-proc.md|OB-8jei]] (trusted binding and bounded processes), [[docs/Private/Tasks/OB-41mc--implement-validated-beans-reads-and-conflict-safe.md|OB-41mc]] (validated reads and conflict-safe mutations), [[docs/Private/Tasks/OB-os2h--implement-shared-query-state-refresh-and-recoverab.md|OB-os2h]] (shared state, refresh and recoverable drafts). Together they deliver the process boundary, the typed adapter and the lifecycle-managed shared state in `src/adapter/`, `src/state/` and the plugin shell.

Integrated verification on the final branch head (Linux, Obsidian 1.14.5), with `OBSIBEANS_BEANS_RELEASE` set to the audited v0.4.2 release (archive and binary SHA-256 checked):

- `yarn verify`: deps, constraints, dedupe, typecheck, lint, fitness, 288 tests in 18 files (including the 19 real-binary tests), coverage gates and changed-code gates passed.
- `yarn test:native`: build and all native smoke checks passed.
- `test/contract/beans-0.4.2/audit.sh`: "Beans 0.4.2 contract holds".

Remaining limitations (accepted for this epic, owned elsewhere or documented):

- Only Linux was tested; Windows and macOS stay documented as unsupported until run.
- Beans has no `ifMatch` for creation and no cross-process lock, so creation is unguarded and a narrow two-writer race remains.
- A file swapped between the digest check and the spawn would still run (`ponytail:` in `binding.ts`).
- No view reads the shared state yet; that wiring starts at OB-s9b7.
- Mixed-direction blocking cycles and type changes against parent and children are not checked locally (OB-op2n, OB-yieb); search escaping and body search are OB-7a9z.
- A config change is noticed at the next load or Refresh, and a crash inside the 400 ms draft-write window loses the newest keystrokes.
