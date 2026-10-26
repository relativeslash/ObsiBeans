---
# OB-26rz
title: Build explicit-target bulk editing with partial-failure recovery
status: todo
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T01:45:43Z
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

- [ ] Show explicit target count including hidden selected beans; context-only ancestors are not silently selected; provide clear-selection and review controls.
- [ ] Apply validated per-bean preconditions and show individual success/failure/conflict outcomes without hiding partial completion.
- [ ] Retry only failed items after re-reading state; never reapply successful operations or automatically retry uncertain writes.
- [ ] Handle selection changes/cancellation during a batch with accurate completed/pending outcomes and accessible feedback.

## Verification

Inject mixed validation errors, conflicts, backend loss and a timeout after a possible write. Assert successful IDs are not retried and CLI state matches each displayed outcome.

## Handoff

Provide bulk result/retry components and deterministic partial-failure fixtures. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.
