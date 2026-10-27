---
# OB-lb80
title: V1 planning views and Obsidian integration
status: completed
type: epic
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:42Z
updated_at: 2026-10-27T20:39:09Z
parent: OB-fgjv
blocked_by:
    - OB-363m
---

## Outcome

Deliver board and hierarchy, saved filters and sidebar, note workflows, discoverable keyboard actions and responsive accessible behavior.

Source: [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]]. Follow the execution rules in [[docs/Private/Tasks/OB-fgjv--obsibeans-v1-native-workspace.md|OB-fgjv — ObsiBeans v1 native workspace]]. This is a grouping and review record, not an independently executable coding task.

## Exit criteria

- [x] Every child is complete with acceptance and verification evidence.
- [x] Integrated behavior meets the design without unresolved safety defects; remaining scope decisions and limitations are documented.

Before completion, append a Summary of Changes linking child evidence.


## Work index

- [[docs/Private/Tasks/OB-q9nz--build-the-status-board-with-accessible-card-moveme.md|OB-q9nz — Build the status board with accessible card movement]]
- [[docs/Private/Tasks/OB-uqrv--build-hierarchy-navigation-and-milestone-progress.md|OB-uqrv — Build hierarchy navigation and milestone progress summaries]]
- [[docs/Private/Tasks/OB-cjoc--build-saved-views-and-ready-work-sidebar.md|OB-cjoc — Build saved views and ready-work sidebar]]
- [[docs/Private/Tasks/OB-rmmo--build-note-links-backlinks-and-selected-text-conve.md|OB-rmmo — Build note links, backlinks and selected-text conversion]]
- [[docs/Private/Tasks/OB-363m--complete-accessible-keyboard-parity-and-responsive.md|OB-363m — Complete accessible keyboard parity and responsive interactions]]

## Summary of Changes

All five children are completed and merged to `main` in [PR #4](https://github.com/relativeslash/ObsiBeans/pull/4). The epic adds the remaining v1 work views, saved filters, note workflows and keyboard and responsive parity to the workspace.

| Child | Delivered | Evidence |
| --- | --- | --- |
| [[docs/Private/Tasks/OB-q9nz--build-the-status-board-with-accessible-card-moveme.md|OB-q9nz]] | Status board with five columns, parent lanes, drag and a keyboard Move picker; a card moves only after Beans confirms | `test/state/board.test.ts`, `test/views/board.test.ts`, native board section |
| [[docs/Private/Tasks/OB-uqrv--build-hierarchy-navigation-and-milestone-progress.md|OB-uqrv]] | Hierarchy view with context rows, leaf-only progress, blockers, new child | `test/state/hierarchy.test.ts`, `test/views/hierarchy.test.ts`, native hierarchy section |
| [[docs/Private/Tasks/OB-cjoc--build-saved-views-and-ready-work-sidebar.md|OB-cjoc]] | Versioned saved views in plugin data only; Ready and In progress sidebar | `test/state/saved-views.test.ts`, `test/views/saved-views.test.ts`, `test/views/sidebar.test.ts`, native saved-view and sidebar sections |
| [[docs/Private/Tasks/OB-rmmo--build-note-links-backlinks-and-selected-text-conve.md|OB-rmmo]] | Related notes, Insert bean link, Convert selection to bean with context-checked writes | `test/state/note-text.test.ts`, `test/plugin/notes.test.ts`, `test/views/note-dialogs.test.ts`, native note section |
| [[docs/Private/Tasks/OB-363m--complete-accessible-keyboard-parity-and-responsive.md|OB-363m]] | Palette command for every action, help dialog, layered Escape, jump keys, narrow-pane focus, focus rings, zoom fix | `test/views/keyboard.test.ts`, native keyboard, narrow and 200% zoom checks, parity matrix keyboard review |

Integration check on the merged result: `yarn verify` passes (562 tests, changed-code coverage gates met) and `yarn test:native` passes (79 checks, Obsidian 1.14.5, isolated instance). The five views share one `WorkspaceState`, one filter set, one selection and one mutation path, so none writes to Beans on its own. No unresolved safety defect is known: writes wait for Beans, conflicts stay reviewable, a failed note write never creates a second bean, and saved views never touch bean files.

### Scope decisions and limitations carried forward

- Saved views are local to the plugin's `data.json` and not shared between vaults or clones.
- The board does not persist arbitrary order within a column (Beans has no ordering field), and a drag never changes a parent.
- Native drag with a real pointer and parent or blocker changes against a real Beans binary were not exercised; jsdom tests drive a scripted port and the native fake Beans reads only type and parent.
- No axe-style tool or screen reader was run and contrast ratios were not measured; colors come from the Obsidian theme and a test guards against hard-coded ones. Keyboard walkthroughs are scripted key events.
- Escape on a focused status, type or priority dropdown does nothing; Tab leaves it. TUI `q`, `ctrl+c`, Backspace and letter paging keys are intentionally not bound.
- Editors that are not workspace tabs (canvas cards, embedded editors) cannot receive note links.
- Windows and macOS are untested. The release-binary tests need `OBSIBEANS_BEANS_RELEASE` and were not run for this epic.
- Final confirmation of every parity row remains with OB-zdg2.

Follow-up beans: none created; the open items above belong to existing v1 verification work.
