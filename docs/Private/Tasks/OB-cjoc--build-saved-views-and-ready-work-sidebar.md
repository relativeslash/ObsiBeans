---
# OB-cjoc
title: Build saved views and ready-work sidebar
status: completed
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-27T18:29:25Z
parent: OB-lb80
blocked_by:
    - OB-7a9z
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **ALM-style additions; Data ownership**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-7a9z--build-the-searchable-list-and-shared-filtering-con.md|OB-7a9z — Build the searchable list and shared filtering controls]]

## Scope and boundaries

Persist named saved searches/filters and presentation preferences as plugin state under the approved sharing policy. Add a compact Ready/In progress sidebar that reuses the same state and action layer.

## Acceptance criteria

- [x] Save, rename, apply and remove saved views without adding bean frontmatter; preserve filter semantics across list/board/hierarchy.
- [x] Validate/version persisted plugin settings and handle corrupt or older saved-view state without losing backend data.
- [x] Sidebar uses backend-verified ready/in-progress semantics, refreshes on external changes and opens the same inspector/issue navigation.
- [x] Saved-view empty/missing targets and stale/disconnected backend states are visible and recoverable.

## Verification

Test settings round trips/migration/invalid state, saved combined filters, sidebar refresh and no writes to bean files when preferences change. Verify native sidebar focus and narrow layout.

## Handoff

Provide private usage guidance for saved views/sidebar and their sharing limitations. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.


## Summary of Changes

- `src/state/saved-views.ts`: saved-view schema (id, name, filters, representation, sort, swimlanes), `schemaVersion` 1 with stepwise migration, per-entry validation that keeps unreadable entries as raw `invalid` values (also newer-version and damaged-list data), one pure `applyViewChange` (save, update, rename, remove; names unique ignoring case) and the unmatched-value report.
- Plugin shell: `data.json` now holds `schemaVersion` and `savedViews` next to settings and drafts; `changeViews` stores, notifies followers and restores the list with a `storage` error when the write fails; command and view `Open Ready and In progress sidebar`.
- Views: saved-view section in `Navigation.svelte` (apply, save, update, rename, confirmed remove, invalid and unmatched notes, errors); `Layout.savedView`; missing-target banner; filters re-applied only when their values change; `Sidebar.svelte` over `WorkspaceState.matching(navFilters(...))` with loading, empty, disconnected, invalid and stale states.
- Docs: AI working guide (usage, sharing limits, migration how-to) and project information (module list).

### Verification

- `yarn verify` (deps, typecheck, lint, fitness, coverage with changed-code gates): pass; 501 tests passed, 21 skipped (release-binary tests need `OBSIBEANS_BEANS_RELEASE`, not run).
- `yarn test:native` (Obsidian 1.14.5): pass, including saved view save/apply/remove with the plugin data and bean file checked, the sidebar in the right split, focus, and no sideways scroll at narrow width.
- New tests: `test/state/saved-views.test.ts`, `test/views/saved-views.test.ts`, `test/views/sidebar.test.ts`, plus plugin persistence and view-lifecycle cases.

### Limitations

- Saved views are plugin-local and are not shared between vaults or clones (accepted v1 decision); move them by copying `savedViews` from `data.json`.
- Only one data-file migration step exists (0 to 1); later steps are untested until a format change needs them.
- Applying a view resets filters but keeps list columns and inspector width, which are not part of a saved view.
- Windows and macOS untested, as for the rest of v1.

No follow-up beans needed.
