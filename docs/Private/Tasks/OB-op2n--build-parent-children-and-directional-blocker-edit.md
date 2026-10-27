---
# OB-op2n
title: Build parent, children and directional blocker editors
status: completed
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-27T02:23:32Z
parent: OB-1bvb
blocked_by:
    - OB-yieb
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Issue details and creation; TUI parity map; Reliability and accessibility requirements**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-yieb--build-inspector-creation-and-recoverable-descripti.md|OB-yieb — Build inspector, creation and recoverable description editing]]

## Scope and boundaries

Implement parent breadcrumbs, child navigation, searchable eligible-parent selection/removal, and distinct Blocked by/Blocks sections with add/remove actions. New child pre-fills parent and validates type through Beans.

## Acceptance criteria

- [x] Parent and blocker editors respect the verified backend constraints and direction semantics; no client-only relationship truth.
- [x] Explain rejected cycles, missing targets, invalid parent/type combinations and concurrent changes without damaging current relationships.
- [x] Related-bean navigation and back action preserve work context; creation cancellation creates no child.
- [x] Relationship changes refresh all affected records and derived readiness/progress; single-bean edits remain distinct from bulk parent changes.

## Verification

Test every relationship direction, removal, missing/cyclic targets, cross-view refresh, new-child defaults and ETag conflicts against real backend fixtures and UI integration tests.

## Handoff

Hand off relation pickers and child-create actions to hierarchy and bulk parent workflows. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Build the blocking graph from both storage directions, check unified-graph cycles locally, and validate type changes against parent and children, as the [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]] requires. Parity rows: TP-11, TP-16, TP-18, TP-19, TP-25 in the [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|TUI parity matrix]].

## Summary of Changes

Parent, children and directional blocker editors (TP-11, TP-16, TP-18, TP-19, TP-25).

- **State (`src/state/relations.ts`):** `PARENT_TYPES`, `ancestry`, `descendantIds`, `eligibleParents`, `typeBlockers`, `inBlockingCycle`, `removalPlan`, `additionOf`, `localProblem`. `WorkspaceState.mutate` runs `localProblem` for every caller before Beans: a type change that breaks the parent or a child (BC-30) and a blocking loop mixing `blocking` and `blocked_by` (BC-35) fail as validation without a Beans call. Parent cycles, missing targets and invalid parent types are still decided by Beans and shown with its message.
- **Views:** `Parent.svelte` (breadcrumb, searchable eligible-parent picker with "No parent" first and the current one marked, remove, milestone explained, loop and missing parent named), `Links.svelte` (separate Blocked by and Blocks from both storage directions, add through the editing bean's own field, remove through the file that stores the link, which can write the other bean and stops at the first failed step, existing loop and missing target shown), `BeanPicker.svelte`. The type picker disables rejected types and says why. New child (`onNewChild`) opens `CreateForm` with a `parentId` kept in the form draft, in the workspace and in issue tabs; Cancel creates nothing. Keys `p` and `b` act on the shown bean only.
- **Related-bean navigation:** breadcrumb, children and blocker links reuse the existing Back trail. Every write refreshes through the shared state's existing reload, so the list, readiness and counts follow.
- **Docs:** contract adapter-decision rows marked implemented; AI working guide describes the editors.
- **Verification:** `OBSIBEANS_BEANS_RELEASE=/tmp/beans-rel/beans yarn verify` passes: 438 tests including the 20 real-binary tests (audited 0.4.2 release, SHA-256 checked), changed-code coverage views 98.8% lines / 86.5% branches, state 100% / 94.6%. The new release test asserts `PARENT_TYPES` against all 25 child/parent pairs; the same test also passed on the developer's `dev` build. `yarn test:native` passes in Obsidian 1.14.5 but does not exercise these editors.
- **Limits:** the UI tests use the scripted `FakePort`, not a real backend, and the native smoke test uses a fake Beans executable, so the editors have not been clicked through in a real window against a real Beans; the adapter calls they use are covered by the release tests. The local loop check uses the last loaded data, so an edit made elsewhere in the meantime can still produce a mixed-direction loop (Beans and `beans check` miss it too). `Fields` shows a failed save of any field under the field last edited, so a failed parent or link write can also appear under a field the user edited earlier in the same visit (existing behavior of `Fields`). Bulk parent changes stay with OB-26rz.
- **Follow-up:** OB-26rz can reuse `eligibleParents` and `WorkspaceState.mutate`'s local checks; OB-uqrv can reuse `ancestry` and `descendantIds`.
