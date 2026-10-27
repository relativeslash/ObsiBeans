---
# OB-q9nz
title: Build the status board with accessible card movement
status: completed
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-27T12:07:56Z
parent: OB-lb80
blocked_by:
    - OB-7a9z
    - OB-yieb
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Work views; Visual direction**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-7a9z--build-the-searchable-list-and-shared-filtering-con.md|OB-7a9z — Build the searchable list and shared filtering controls]]
- [[docs/Private/Tasks/OB-yieb--build-inspector-creation-and-recoverable-descripti.md|OB-yieb — Build inspector, creation and recoverable description editing]]

## Scope and boundaries

Add a board over the same filters, selection and action layer. Columns use the five real Beans statuses. Cross-column drag is a status mutation; same-column drag must not imply unsupported persisted order. Parent swimlanes are in v1; implement them as defined in [[docs/Private/Design/ObsiBeans native workspace proposal.md#Board swimlanes|Board swimlanes]].

## Acceptance criteria

- [x] Render draft, todo, in-progress, completed and scrapped columns with deterministic stable sorting and correct filtered counts.
- [x] Cross-status movement and equivalent keyboard/visible Move action use shared mutations and converge with list/inspector.
- [x] Pending/failure/conflict paths restore or reconcile card position without falsely reporting a saved move.
- [x] Switching views preserves selected bean and shared filters; contextual ancestors and swimlane headers cannot become implicit bulk targets.
- [x] Per-view parent swimlanes group cards by direct parent plus a No parent lane in deterministic order; cross-lane drag is rejected and never changes a parent.

## Verification

Test every status transition, drag cancellation, keyboard alternative, rejected/conflicting movement, filtered selection and deterministic same-column order. Verify light/dark and narrow layouts in Obsidian.

## Handoff

Provide board parity evidence, including swimlane behavior. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Progress

- Implemented `src/state/board.ts` (columns, filtered counts, lanes), `src/views/Board.svelte`, and a List/Board switch plus "Group by parent" in the list controls; `view` and `swimlanes` are saved in the workspace layout. The board renders inside `WorkList`, so filters, selection, bulk bar, banners and the mutation path are shared.
- Fixed a defect found on the way: any layout change replaced `current` and re-applied the navigation filters, so switching view would have reset the user's filters. `Workspace.svelte` now reads the navigation entry through a derived value.
- Evidence: `yarn verify` passes; tests in `test/state/board.test.ts` and `test/views/board.test.ts` cover status transitions, drag and cancelled drag, the Move select, pending/failure/conflict, same-column drop, cross-lane rejection and view switching.

## Summary of Changes

- Added `src/state/board.ts` (five workflow-ordered status columns, filtered per-column counts, per-parent lanes plus No parent), `src/views/Board.svelte`, and a List/Board switch with a Group by parent option in `ListControls`. `view` and `swimlanes` are saved in the workspace layout. The board renders inside `WorkList`, so filters, selection, bulk bar, banners and the field mutation are shared with the list.
- Moving: drag between columns or the per-card Move picker, both through `WorkspaceState.mutate`. A card stays put until Beans confirms; failure and conflict show the message (with Apply my change again) and restore the picker. Same-column drops, cancelled drags and cross-lane drops write nothing, so a parent is never changed by drag. Lane headers have no checkbox or action and the board shows no context rows, so neither can become a bulk target.
- Fixed a defect found on the way: layout changes re-applied the navigation filters, which would have reset filters on every view switch.
- Evidence: `yarn verify` passes (new `test/state/board.test.ts`, `test/views/board.test.ts`). `yarn test:native` (Obsidian 1.14.5, Linux, isolated instance) passes with a new board section: Board switch, five columns, dark/light/narrow screenshots reviewed (narrow board scrolls horizontally inside the work pane), switch back to list.
- Limitations: native drag-and-drop with a real pointer and a real move through Beans were not exercised; drag is covered by synthetic events in jsdom, the move mutation by the scripted port. The smoke test's fake Beans does not implement updates. Hierarchy view and saved-view `representation` are other beans; `Layout.view` accepts only list and board until OB-uqrv adds hierarchy.
- Follow-up: none required.
