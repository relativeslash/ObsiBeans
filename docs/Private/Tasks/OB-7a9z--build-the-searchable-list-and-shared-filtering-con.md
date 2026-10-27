---
# OB-7a9z
title: Build the searchable list and shared filtering controls
status: completed
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-27T00:05:22Z
parent: OB-1bvb
blocked_by:
    - OB-s9b7
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Work views; TUI parity map**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-s9b7--build-native-workspace-navigation-and-issue-tab-li.md|OB-s9b7 — Build native workspace navigation and issue-tab lifecycle]]

## Scope and boundaries

Implement compact list rows, configurable columns, deterministic sorting, search, tag chips and status/type/priority filters. Route inline metadata actions through the shared layer. Distinguish true matches from contextual parents.

## Acceptance criteria

- [x] Search/filter/clear/reset, sorting and column preferences work with the adapter contract and have visible controls and keyboard access.
- [x] Inline fields save with accurate pending/error/conflict feedback and refresh all consumers.
- [x] Contextual ancestors are visually identified and excluded from match counts and implicit selection.
- [x] Checkbox selection and copy current/selected IDs use full stable IDs; preserve explicit hidden selections and expose the target count and clear action.
- [x] Avoid eager body fetches and preserve focus/scroll as data refreshes; empty project and zero matches remain distinct.

## Verification

Test combined filters, stable tie-break sorting, hierarchy context, selection across filter changes and backend readiness cases. Smoke test large lists and keyboard navigation in Obsidian.

## Handoff

Hand off shared filter and selection controls for bulk actions and alternate views. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Sort client-side and treat search input as plain text, as the [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]] requires. Parity rows: TP-01, TP-06, TP-07 in the [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|TUI parity matrix]].

## Summary of Changes

Searchable list and shared filtering controls, on branch `OB-1bvb--core-workspace-and-editing`.

- `src/state/filters.ts`, `model.ts`: `sortBeans` (client-side, stable; ties keep the default order ending in the full ID), `listRows` (matches plus ancestors as `context` rows, identity-based, cycle and missing-parent safe), `tagCounts`; `WorkspaceState.vocabulary`; `BeanSummary` and `Change` re-exported for views.
- `src/views/ListControls.svelte` (new): search field with Clear, Reset filters (back to the navigation entry's filters), status/type/priority/tag chips with counts, match count, sort key and direction, column picker, selection bar (count, hidden count, Select all matches, Clear, Copy ID, Copy selected IDs).
- `src/views/WorkList.svelte`: checkbox per matching row, configurable columns, inline status/type/priority pickers (pending shows the intended value, failure restores the cached value, conflict offers "apply my change again" on the current revision, files with problems are read-only), context rows, shortcuts `j`/`k`, Space, `y`, `/`, `g t`, Escape (TP-06, TP-07).
- `src/views/layout.ts`: sort and columns saved with the layout; damaged values fall back per field.
- `test/native/smoke.ts`: 2,000-bean project, search, `j`, Space, `/`, Escape in the real app.

### Verification (2026-10-27 UTC, Linux, Obsidian 1.14.5)

- `yarn verify`: pass. Changed-line coverage above the minimums on all layers.
- `yarn test:native`: pass, including 2,002 rows loaded and rendered in about 1.5 s, search narrowing to 12 matches, and the keyboard checks.
- New headless tests: `test/state/rows.test.ts` (sorting, tie-breaks, context rows, tag counts) and `test/views/work-list.test.ts` (combined search, filters, tags, clear and reset; empty project vs zero matches; sort and column persistence; inline pending, failure and conflict; read-only beans; hidden selections, counts and copied IDs; keyboard; focus kept across a refresh).

### Limitations and follow-ups

- No virtual list: off-screen rows use `content-visibility: auto`. Revisit if projects far beyond a few thousand beans appear.
- A selected bean that is only context counts as hidden and has no checkbox; Clear selection removes it.
- Context ancestors sit in the same sort order as matches, not as a tree. The tree is the Hierarchy view.
- Readiness is filtered through the navigation entries only; there is no readiness chip.
- Arrow-key navigation is in, but the help overlay and Back shortcuts remain OB-363m.
