---
# OB-363m
title: Complete accessible keyboard parity and responsive interactions
status: todo
type: task
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T01:45:43Z
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

- [ ] Audit every matrix action/modal for visible and keyboard access, including copy IDs, selection/advance, tag filter, related navigation, back and close-view.
- [ ] Shortcuts do not fire in text inputs or unrelated views; Escape closes the correct layer without silently discarding drafts, and close never quits Obsidian.
- [ ] Keyboard focus, accessible names, non-color indicators, zoom, reduced motion and light/dark styling are verified across list/board/hierarchy/inspector/sidebar.
- [ ] Narrow-pane navigation and details/back preserve essential actions, selection, focus and scroll; help accurately reflects supported optional bindings.

## Verification

Perform scripted component/focus tests and keyboard-only native walkthroughs of the complete parity matrix, narrow panes, zoom and theme variants. Record accessibility tooling/manual evidence and gaps.

## Handoff

Hand off the completed interaction matrix with evidence references and any unresolved defects blocking release. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.
