---
# OB-uqrv
title: Build hierarchy navigation and milestone progress summaries
status: todo
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T02:37:28Z
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

- [ ] Expand/collapse and keyboard related-bean navigation retain stable identity and context under filtering.
- [ ] Parent context differs from real matches and is excluded from match counts and implicit selection.
- [ ] Progress uses explicit eligible leaf/descendant counting, shows completed separately from scrapped and avoids counting intermediate parents twice; define empty-parent results.
- [ ] Child creation, parent changes and blocking changes update the hierarchy and summaries from authoritative backend state.
- [ ] Malformed/missing hierarchy references produce bounded, actionable behavior rather than infinite traversal.

## Verification

Use fixtures with multiple levels, empty milestones, mixed completed/scrapped leaves, filtered children, invalid references and parent changes. Verify counts independently and test keyboard expansion/navigation in Obsidian.

## Handoff

Document the displayed counting rules and provide reproducible hierarchy fixtures. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

The backend accepts mixed-direction blocking cycles and type changes that leave invalid children; traverse with bounds and show such data as invalid. See the [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]].
