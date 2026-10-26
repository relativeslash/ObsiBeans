---
# OB-s9b7
title: Build native workspace navigation and issue-tab lifecycle
status: completed
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T23:31:39Z
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

- [x] Provide built-in All work, Ready, In progress, Blocked, Milestones and Epics navigation with consistent selected ID and backend-verified filtering semantics.
- [x] Support inspector selection, issue tabs, related-item/back navigation, saved layout and narrow-pane navigation/detail collapse without losing scroll or selection.
- [x] Render all application error/loading/save/stale states with actionable controls and accessible names.
- [x] Use Obsidian theme tokens/icons/focus, light/dark modes and density preferences; close the view without quitting Obsidian or silently losing a draft.

## Verification

Run view lifecycle tests and native Obsidian smoke checks for opening/reopening multiple tabs, resizing, focus restoration, error states and unload. Capture representative native screenshots.

## Handoff

Provide reusable native UI primitives and view lifecycle patterns used by the remaining feature leaves. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Parity rows: TP-05, TP-09, TP-11, TP-12 in the [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|TUI parity matrix]].


## Summary of Changes

Native workspace and issue-tab foundation, on branch `OB-1bvb--core-workspace-and-editing`.

- `src/state/navigation.ts`: built-in entries (All work, Ready, In progress, Blocked, Milestones, Epics) as fixed filter sets over the backend readiness the adapter already computes; both blocker directions of a bean (BC-37, TP-11); a bounded Back trail (TP-12).
- `src/views/`: `WorkspaceView` (navigation, list, resizable inspector with a keyboard-operable splitter, status bar, Close) and `IssueView` (one bean per tab). Shared `WorkspaceHost` contract, `follow()` for reactive state following rebinds, saved layout in `getState`/`setState`, shared `Navigation`, `WorkList`, `Inspector`, `StatusBar` primitives. Below 760 px panes stack with Back and keep list scroll and focused row (TP-05).
- Application states rendered with actionable controls: loading, empty, no matches (Show all work), disconnected and invalid data (Retry), stale banner (Refresh), skipped files, removed selection, pending/failed/conflict/uncertain saves (Dismiss), unsaved drafts.
- Plugin shell: ribbon icon, `Close Beans view` command (TP-09; closes only the active Beans tab), `openIssue(id)`, `density` setting (Comfortable/Compact).
- Bug found by the native smoke test and fixed: rows were keyed by bean ID, so two files claiming one ID stopped the whole component tree updating; rows are keyed by file path.

### Verification (2026-10-26 UTC, Linux, Obsidian 1.14.5)

- `yarn verify`: pass. 309 tests passed, 19 skipped (the release-binary tests, `OBSIBEANS_BEANS_RELEASE` not set). Changed-line coverage per layer above the minimums.
- `yarn test:native`: pass, including a bound workspace, navigation, inspector, several issue tabs, narrow pane, stale-data banner and recovery, close command, unload and reload. Screenshots captured with `OBSIBEANS_SCREENSHOTS`: wide dark, wide light, narrow, issue tab, stale.
- Headless view tests cover lifecycle, every navigation entry, link and Back, scroll and focus restoration, resize by keyboard and pointer, and every application state.

### Limitations and follow-ups

- Row and relation buttons are plain tab stops. Arrow-key list navigation, Escape/Backspace for Back, and the help overlay belong to OB-363m.
- The save-state footer lists conflict, failed and uncertain writes with Dismiss only. Review and overwrite controls arrive with the editors (OB-yieb, OB-op2n).
- Focus restoration and scroll restoration are verified headless, not in the native window.
- Light theme was checked once by screenshot with the body class flipped, not through Obsidian's theme switcher.
- Search, filters, tag chips and a New bean action: OB-7a9z and OB-yieb. Blocking badges on rows were not added.
