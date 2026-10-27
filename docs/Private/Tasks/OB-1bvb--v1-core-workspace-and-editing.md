---
# OB-1bvb
title: V1 core workspace and editing
status: completed
type: epic
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:42Z
updated_at: 2026-10-27T03:18:50Z
parent: OB-fgjv
blocked_by:
    - OB-26rz
---

## Outcome

Deliver native navigation, list, inspector, issue tabs, creation, body editing, relationships and explicit per-bean bulk results.

Source: [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]]. Follow the execution rules in [[docs/Private/Tasks/OB-fgjv--obsibeans-v1-native-workspace.md|OB-fgjv — ObsiBeans v1 native workspace]]. This is a grouping and review record, not an independently executable coding task.

## Exit criteria

- [x] Every child is complete with acceptance and verification evidence.
- [x] Integrated behavior meets the design without unresolved safety defects; remaining scope decisions and limitations are documented.

Before completion, append a Summary of Changes linking child evidence.


## Work index

- [[docs/Private/Tasks/OB-s9b7--build-native-workspace-navigation-and-issue-tab-li.md|OB-s9b7 — Build native workspace navigation and issue-tab lifecycle]]
- [[docs/Private/Tasks/OB-7a9z--build-the-searchable-list-and-shared-filtering-con.md|OB-7a9z — Build the searchable list and shared filtering controls]]
- [[docs/Private/Tasks/OB-yieb--build-inspector-creation-and-recoverable-descripti.md|OB-yieb — Build inspector, creation and recoverable description editing]]
- [[docs/Private/Tasks/OB-op2n--build-parent-children-and-directional-blocker-edit.md|OB-op2n — Build parent, children and directional blocker editors]]
- [[docs/Private/Tasks/OB-26rz--build-explicit-target-bulk-editing-with-partial-fa.md|OB-26rz — Build explicit-target bulk editing with partial-failure recovery]]

## Summary of Changes

All five children are complete with acceptance and verification evidence: [[docs/Private/Tasks/OB-s9b7--build-native-workspace-navigation-and-issue-tab-li.md|OB-s9b7]] (navigation, workspace view, issue tabs), [[docs/Private/Tasks/OB-7a9z--build-the-searchable-list-and-shared-filtering-con.md|OB-7a9z]] (searchable list, filters, selection), [[docs/Private/Tasks/OB-yieb--build-inspector-creation-and-recoverable-descripti.md|OB-yieb]] (inspector, creation, recoverable description editing), [[docs/Private/Tasks/OB-op2n--build-parent-children-and-directional-blocker-edit.md|OB-op2n]] (parent, children, directional blockers), [[docs/Private/Tasks/OB-26rz--build-explicit-target-bulk-editing-with-partial-fa.md|OB-26rz]] (explicit-target bulk editing with partial-failure recovery). Together they deliver the native workspace over the shared state: one list, inspector and issue tabs with one action layer, creation, body editing, relationship editing and per-bean bulk results with failed-only retry. The plugin is also enabled in the vault through tracked relative symlinks to `dist/`, which stay dangling until `yarn build` has run.

Integrated verification on the final branch head (Linux, Obsidian 1.14.5), with `OBSIBEANS_BEANS_RELEASE` set to the audited v0.4.2 release binary (SHA-256 `a96444ff...e94307` checked against the contract note):

- `OBSIBEANS_BEANS_RELEASE=<binary> yarn verify`: deps, constraints, dedupe, typecheck, lint, fitness and coverage pass; 454 of 454 tests in 32 files, none skipped, including the 21 real-binary tests. Changed-code gates: adapter 100% lines, plugin 97.9%, state 100%, views 98.4%.
- `yarn test:native`: build and all native smoke checks pass, including the bulk bar.
- `yarn verify` also passes with `dist/` absent, so the dangling symlinks do not affect a fresh checkout.

Remaining limitations (documented in the child records, none a known safety defect):

- Only Linux was tested. Windows and macOS stay unsupported until run.
- The native smoke test uses a fake Beans executable, so the editors and bulk edits were not clicked through in a real window against a real Beans. Their write paths are covered by the real-binary tests and headless component tests.
- The local blocking-loop and type checks use the last loaded data; an edit made elsewhere in the meantime can slip through (Beans and `beans check` miss mixed-direction loops too).
- Bulk edits run one bean at a time (`ponytail:` in `src/state/bulk.ts`), and TUI-style bulk keys (`s`, `t`, `P`, `p` with a selection) are not added; the toolbar is the keyboard-accessible control.
- No virtual list: off-screen rows use `content-visibility: auto` (2,002 rows render in about 1.5 s). Context ancestors are not drawn as a tree; that is the Hierarchy view.
- Help overlay and Back shortcuts remain OB-363m; board, hierarchy and the other views are owned by their own epics.
