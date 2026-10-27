---
# OB-363m
title: Complete accessible keyboard parity and responsive interactions
status: completed
type: task
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-27T20:02:33Z
parent: OB-lb80
blocked_by:
    - OB-26rz
    - OB-q9nz
    - OB-uqrv
    - OB-cjoc
    - OB-rmmo
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **TUI parity map; Workspace layout; Reliability and accessibility requirements**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-26rz--build-explicit-target-bulk-editing-with-partial-fa.md|OB-26rz — Build explicit-target bulk editing with partial-failure recovery]]
- [[docs/Private/Tasks/OB-q9nz--build-the-status-board-with-accessible-card-moveme.md|OB-q9nz — Build the status board with accessible card movement]]
- [[docs/Private/Tasks/OB-uqrv--build-hierarchy-navigation-and-milestone-progress.md|OB-uqrv — Build hierarchy navigation and milestone progress summaries]]
- [[docs/Private/Tasks/OB-cjoc--build-saved-views-and-ready-work-sidebar.md|OB-cjoc — Build saved views and ready-work sidebar]]
- [[docs/Private/Tasks/OB-rmmo--build-note-links-backlinks-and-selected-text-conve.md|OB-rmmo — Build note links, backlinks and selected-text conversion]]

## Scope and boundaries

Complete the parity matrix across all views with focus-scoped shortcuts, help, visible controls and palette equivalents. Accessibility belongs in preceding features too; this task closes cross-view gaps, not a justification to defer accessible primitives.

## Acceptance criteria

- [x] Audit every matrix action/modal for visible and keyboard access, including copy IDs, selection/advance, tag filter, related navigation, back and close-view.
- [x] Shortcuts do not fire in text inputs or unrelated views; Escape closes the correct layer without silently discarding drafts, and close never quits Obsidian.
- [x] Keyboard focus, accessible names, non-color indicators, zoom, reduced motion and light/dark styling are verified across list/board/hierarchy/inspector/sidebar.
- [x] Narrow-pane navigation and details/back preserve essential actions, selection, focus and scroll; help accurately reflects supported optional bindings.

## Verification

Perform scripted component/focus tests and keyboard-only native walkthroughs of the complete parity matrix, narrow panes, zoom and theme variants. Record accessibility tooling/manual evidence and gaps.

## Handoff

Hand off the completed interaction matrix with evidence references and any unresolved defects blocking release. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Parity rows: TP-02 to TP-04, TP-08 to TP-10, TP-13, TP-27 in the [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|TUI parity matrix]]. Confirm the intentional differences recorded in TP-03 and TP-13.

## Summary of Changes

Implemented in the epic clone on branch `OB-lb80--planning-views-and-obsidian-integration`; nothing pushed.

- **Actions and palette.** `src/views/actions.ts` lists every keyboard-reachable action and holds the only key tables (`LIST_KEYS`, `DETAIL_KEYS`). Each of the 19 actions is a palette command (`action-<id>`), available only while a Beans view that supports it is active; views receive the command through an `ActionPort`. In a narrow pane the covered pane is shown first.
- **List keys.** Home, End, Page Up and Page Down (TP-03, TP-04) join the arrows and `j`/`k` in list, board and hierarchy. Escape clears the selection, then the tag filter, then the search text, then does nothing (TP-08). Shortcuts share one `isText` guard and never fire in fields or selects.
- **Help (TP-10).** `Help.svelte` is an inline modal opened by `?`, a Help button in the workspace and issue tab, or a command. Its rows are generated from the key tables. Escape or `?` closes it and focus returns.
- **Layers.** The creation form now leaves on Escape from any field and keeps its draft (before: Escape silently discarded it); only Cancel discards. Escape in the inspector goes back unless a text field or picker owns it.
- **Narrow panes and zoom (TP-27).** A pane that opens takes focus; the toolbar wraps; at high zoom the list pane keeps a 12rem list and scrolls as a whole (found in the native run: the controls covered the list and the status bar at 200%).
- **Visibility.** Rows reset `box-shadow`, which hid Obsidian's focus ring; each root component now draws an outline for `:focus-visible`. Active chips and view buttons carry a check mark besides color.
- Docs: AI working guide and the parity matrix (new Keyboard review section; TP-03 and TP-13 differences confirmed).

## Verification

- `yarn verify`: passes (typecheck 0 errors, lint, fitness, 561 tests; changed-code coverage views 98.6% lines / 85.6% branches).
- New tests: `test/views/keyboard.test.ts` (jumps in all three views, layered Escape, help, every palette action through the view, Escape in the inspector, accessible-name audit of list/board/hierarchy/inspector/help/form, no-motion and no-hard-coded-color guards), narrow-pane and focus cases in `test/views/workspace-view.test.ts`, command registration and availability in `test/plugin/main.test.ts`, sidebar names in `test/views/sidebar.test.ts`. A mutation check (removing a board select's label) made the name audit fail.
- `yarn test:native` (Obsidian 1.14.5, real window, scripted key events): End/Home/Page jumps (Page Down moved exactly the rows that fit: 10), layered Escape, `?` help with focus return, palette commands (hierarchy, list, search, help), narrow toolbar, focus into details and Escape back, 200% zoom without sideways overflow or controls over the status bar. Screenshots (help, narrow, zoom) were reviewed by hand.

## Limitations and gaps

- No axe or other external accessibility tool and no screen reader were run; names, roles and focus are checked by the in-repo audit and svelte-check. Contrast was not measured: all colors come from the Obsidian theme (guarded by a test), and light and dark screenshots were looked at, not ratio-checked.
- The keyboard walkthrough is scripted key events, not a person at the keyboard. The sandbox window has no OS focus, so the native test dispatches the `focus` event itself.
- Escape on a focused picker `select` (opened with `s`, `t` or `P`) does nothing; Tab leaves it. At 200% zoom the list is reached by scrolling the pane.
- Backspace, `q` and `ctrl+c` from the TUI are not bound (TP-08, TP-09: closing is the explicit command and button).
- The clone's vault was not opened in Obsidian, so `obsidian unresolved` was not run; the two note edits add no new link targets.
- Follow-up: the epic OB-lb80 and its parent still need their own completion records; OB-zdg2 confirms the parity rows at the end.
