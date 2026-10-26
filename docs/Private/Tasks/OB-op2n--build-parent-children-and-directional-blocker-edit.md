---
# OB-op2n
title: Build parent, children and directional blocker editors
status: todo
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T02:37:28Z
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

- [ ] Parent and blocker editors respect the verified backend constraints and direction semantics; no client-only relationship truth.
- [ ] Explain rejected cycles, missing targets, invalid parent/type combinations and concurrent changes without damaging current relationships.
- [ ] Related-bean navigation and back action preserve work context; creation cancellation creates no child.
- [ ] Relationship changes refresh all affected records and derived readiness/progress; single-bean edits remain distinct from bulk parent changes.

## Verification

Test every relationship direction, removal, missing/cyclic targets, cross-view refresh, new-child defaults and ETag conflicts against real backend fixtures and UI integration tests.

## Handoff

Hand off relation pickers and child-create actions to hierarchy and bulk parent workflows. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Build the blocking graph from both storage directions, check unified-graph cycles locally, and validate type changes against parent and children, as the [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]] requires. Parity rows: TP-11, TP-16, TP-18, TP-19, TP-25 in the [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|TUI parity matrix]].
