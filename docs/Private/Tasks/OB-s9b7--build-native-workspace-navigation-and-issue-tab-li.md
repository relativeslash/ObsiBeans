---
# OB-s9b7
title: Build native workspace navigation and issue-tab lifecycle
status: todo
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T02:37:28Z
parent: OB-1bvb
blocked_by:
    - OB-os2h
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Workspace layout; Visual direction; Architecture proposal**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-os2h--implement-shared-query-state-refresh-and-recoverab.md|OB-os2h — Implement shared query state, refresh and recoverable drafts]]

## Scope and boundaries

Register native workspace and dedicated issue views with left navigation, main work area and resizable inspector. Provide command/ribbon access and settings/status surfaces. Bind presentation to shared state, not subprocess output.

## Acceptance criteria

- [ ] Provide built-in All work, Ready, In progress, Blocked, Milestones and Epics navigation with consistent selected ID and backend-verified filtering semantics.
- [ ] Support inspector selection, issue tabs, related-item/back navigation, saved layout and narrow-pane navigation/detail collapse without losing scroll or selection.
- [ ] Render all application error/loading/save/stale states with actionable controls and accessible names.
- [ ] Use Obsidian theme tokens/icons/focus, light/dark modes and density preferences; close the view without quitting Obsidian or silently losing a draft.

## Verification

Run view lifecycle tests and native Obsidian smoke checks for opening/reopening multiple tabs, resizing, focus restoration, error states and unload. Capture representative native screenshots.

## Handoff

Provide reusable native UI primitives and view lifecycle patterns used by the remaining feature leaves. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Parity rows: TP-05, TP-09, TP-11, TP-12 in the [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|TUI parity matrix]].
