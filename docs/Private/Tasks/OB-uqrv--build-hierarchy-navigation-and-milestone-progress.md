---
# OB-uqrv
title: Build hierarchy navigation and milestone progress summaries
status: completed
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-27T12:29:14Z
parent: OB-lb80
blocked_by:
    - OB-7a9z
    - OB-op2n
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Work views; ALM-style additions**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-7a9z--build-the-searchable-list-and-shared-filtering-con.md|OB-7a9z — Build the searchable list and shared filtering controls]]
- [[docs/Private/Tasks/OB-op2n--build-parent-children-and-directional-blocker-edit.md|OB-op2n — Build parent, children and directional blocker editors]]

## Scope and boundaries

Implement expandable hierarchical browsing, parent context, milestone/epic planning, blockers and quick child creation. Use the approved counting contract; do not invent a scheduling/date model.

## Acceptance criteria

- [x] Expand/collapse and keyboard related-bean navigation retain stable identity and context under filtering.
- [x] Parent context differs from real matches and is excluded from match counts and implicit selection.
- [x] Progress uses explicit eligible leaf/descendant counting, shows completed separately from scrapped and avoids counting intermediate parents twice; define empty-parent results.
- [x] Child creation, parent changes and blocking changes update the hierarchy and summaries from authoritative backend state.
- [x] Malformed/missing hierarchy references produce bounded, actionable behavior rather than infinite traversal.

## Verification

Use fixtures with multiple levels, empty milestones, mixed completed/scrapped leaves, filtered children, invalid references and parent changes. Verify counts independently and test keyboard expansion/navigation in Obsidian.

## Handoff

Document the displayed counting rules and provide reproducible hierarchy fixtures. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

The backend accepts mixed-direction blocking cycles and type changes that leave invalid children; traverse with bounds and show such data as invalid. See the [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]].

## Summary of Changes

- Added the Hierarchy work view, the third `Layout.view` beside list and board (`src/views/Hierarchy.svelte`, `src/state/hierarchy.ts`; `layout.ts`, `ListControls.svelte`, `WorkList.svelte`, `Workspace.svelte`, `messages.en.ts`). It shares filters, selection, bulk bar, banners, sort and the inspector with the other views.
- Expand and collapse: a twisty per parent plus Expand all and Collapse all. Choices are kept by full bean ID in `WorkList`, so view switches and refreshes keep them. Unchosen parents are closed when nothing is filtered and open while a filter hides beans, so matches are not buried. Keyboard: Right opens or enters the first child, Left closes or returns to the parent row, and the list's `j`/`k`/arrows/Space still work.
- Parent context: ancestors of matches are `context` rows (dimmed, labelled, twisty but no checkbox), never in `visible`, the match count, selection or copied IDs. Under a filter only matches and their ancestors are children.
- Progress (`progressByBean`), displayed rule also shown on screen: leaf descendants at any depth, never the parent or intermediate parents; completed, scrapped and open shown apart; percent is completed over non-scrapped leaves, rounded down; "All scrapped (n)" when only scrapped leaves remain; "No child work" for a milestone, epic or feature without children. An empty epic below a milestone counts as one leaf by the design's definition. Counts are always over the whole project.
- Blockers: rows list open blockers from both storage directions (BC-38) and flag a blocking loop. New child on a row reuses the creation form with the parent filled in. Parent, blocking and creation changes show up through the normal reload after a confirmed write.
- Invalid data: a missing parent or parent loop draws the bean as a top-level row with an actionable message; every bean is drawn once, so loops and duplicate IDs cannot repeat or hang.
- Docs: AI working guide (Hierarchy bullet with the counting rules) and the Beans 0.4.2 contract note (cycle row).
- Evidence: `yarn verify` passes (467 tests, new `test/state/hierarchy.test.ts` and `test/views/hierarchy.test.ts` with multi-level, empty-milestone, mixed completed/scrapped, filtered, missing-parent, parent-loop, blocking-loop and parent-change fixtures; changed-line coverage gates pass). `yarn test:native` (Obsidian 1.14.5, Linux, isolated instance) passes with a hierarchy section: real ArrowRight/ArrowLeft key events open the epic, enter the child and return, progress text checked, dark/light/narrow screenshots reviewed, switching back to the list.
- Limitations: the native smoke test's fake Beans reads only `type` and `parent` from frontmatter, so parent changes and blockers in the real app are covered by jsdom tests against the scripted port, not a real binary. The expand state is per workspace tab and not persisted across restarts. Progress is one descendant walk per parent (O(parents x beans), marked `ponytail:`), fine for thousands of beans.
- Follow-up: none required. Saved-view representation `hierarchy` can use `Layout.view` as is (OB-cjoc).
