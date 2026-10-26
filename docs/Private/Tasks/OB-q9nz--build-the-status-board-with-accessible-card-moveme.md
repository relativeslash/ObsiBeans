---
# OB-q9nz
title: Build the status board with accessible card movement
status: todo
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T02:01:30Z
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

- [ ] Render draft, todo, in-progress, completed and scrapped columns with deterministic stable sorting and correct filtered counts.
- [ ] Cross-status movement and equivalent keyboard/visible Move action use shared mutations and converge with list/inspector.
- [ ] Pending/failure/conflict paths restore or reconcile card position without falsely reporting a saved move.
- [ ] Switching views preserves selected bean and shared filters; contextual ancestors and swimlane headers cannot become implicit bulk targets.
- [ ] Per-view parent swimlanes group cards by direct parent plus a No parent lane in deterministic order; cross-lane drag is rejected and never changes a parent.

## Verification

Test every status transition, drag cancellation, keyboard alternative, rejected/conflicting movement, filtered selection and deterministic same-column order. Verify light/dark and narrow layouts in Obsidian.

## Handoff

Provide board parity evidence, including swimlane behavior. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.
