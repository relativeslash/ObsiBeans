---
# OB-26rz
title: Build explicit-target bulk editing with partial-failure recovery
status: completed
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-27T03:01:09Z
parent: OB-1bvb
blocked_by:
    - OB-7a9z
    - OB-op2n
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **TUI parity map; Reliability and accessibility requirements**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-7a9z--build-the-searchable-list-and-shared-filtering-con.md|OB-7a9z — Build the searchable list and shared filtering controls]]
- [[docs/Private/Tasks/OB-op2n--build-parent-children-and-directional-blocker-edit.md|OB-op2n — Build parent, children and directional blocker editors]]

## Scope and boundaries

Support batch status/type/priority/parent updates and copying selected IDs. Treat each bean as an independent mutation; no body or blocker bulk workflow and no claim of cross-bean transactions.

## Acceptance criteria

- [x] Show explicit target count including hidden selected beans; context-only ancestors are not silently selected; provide clear-selection and review controls.
- [x] Apply validated per-bean preconditions and show individual success/failure/conflict outcomes without hiding partial completion.
- [x] Retry only failed items after re-reading state; never reapply successful operations or automatically retry uncertain writes.
- [x] Handle selection changes/cancellation during a batch with accurate completed/pending outcomes and accessible feedback.

## Verification

Inject mixed validation errors, conflicts, backend loss and a timeout after a possible write. Assert successful IDs are not retried and CLI state matches each displayed outcome.

## Handoff

Provide bulk result/retry components and deterministic partial-failure fixtures. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Run bulk work as one mutation call per bean, as the [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]] requires. Parity rows: TP-22 to TP-25 in the [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|TUI parity matrix]].

## Summary of Changes

Bulk status/type/priority/parent editing over the explicit selection, one independent Beans mutation per bean.

- `src/state/bulk.ts` (`BulkRunner`, wired into `WorkspaceState` as `applyBulk`, `cancelBulk`, `retryBulk`, `reconcileBulk`, `dismissBulk`; `Snapshot.bulk`). Sequential, each bean on the revision it had when Apply was pressed. Targets are frozen at start, so later selection changes or refreshes cannot change a run. Outcomes: saved, unchanged (already had the value, no write), failed, conflict, uncertain, skipped, cancelled.
- Retry re-reads the project first, then runs only beans without a saved result; an uncertain bean needs the user's explicit check before it is retried; a failed re-read writes nothing. Cancel stops before the next bean and reports the one in flight truthfully. A run stays shown until closed.
- `localProblem` now also checks parent edits (type table, own parent, own subtree) for every caller, so a bulk parent change refuses the invalid beans without calling Beans.
- UI: `BulkBar.svelte` (target count with hidden beans, field/value or parent picker, Apply, review list with per-bean removal) and `BulkResults.svelte` (live summary, per-bean problems, Stop, Retry, Close). English messages added. Copying selected IDs already existed (OB-7a9z) and covers hidden members.

### Verification

- `yarn verify`: 433 passed, 21 skipped (release-binary tests); changed-code coverage gates pass.
- `yarn test:native` (Obsidian 1.14 on Linux): all steps pass, including a new one for the bulk bar.
- `OBSIBEANS_BEANS_RELEASE=$HOME/go/bin/beans yarn vitest run test/adapter/beans-release.test.ts test/adapter/beans-adapter-release.test.ts test/adapter/bulk-release.test.ts`: 21 of 21 pass. `test/adapter/bulk-release.test.ts` injects a locally refused bean, an external edit (conflict), a backend loss and a write whose answer is lost; it asserts the exact write sequence (the saved bean is never rewritten, the already-applied one is spared a second write after the re-read) and that the files on disk match each displayed outcome.

### Limitations

- The release-binary run used the developer `dev` build, not the audited 0.4.2 tarball (not downloaded here).
- Sequential writes only (ponytail: raise concurrency if a selection of hundreds proves slow).
- Beans-side validation of a rejected bulk value is covered by the existing adapter tests, not by a new bulk case.
- Retry may use data a little older than the re-read if another write supersedes the load; the revision guard then reports a conflict instead of overwriting.
- Keyboard shortcuts for bulk apply (TUI `s`, `t`, `P`, `p` with a selection) are not added; the toolbar is the keyboard-accessible control.
