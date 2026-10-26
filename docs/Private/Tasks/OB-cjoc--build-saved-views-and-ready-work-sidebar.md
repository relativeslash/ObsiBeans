---
# OB-cjoc
title: Build saved views and ready-work sidebar
status: todo
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T01:45:43Z
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

- [ ] Save, rename, apply and remove saved views without adding bean frontmatter; preserve filter semantics across list/board/hierarchy.
- [ ] Validate/version persisted plugin settings and handle corrupt or older saved-view state without losing backend data.
- [ ] Sidebar uses backend-verified ready/in-progress semantics, refreshes on external changes and opens the same inspector/issue navigation.
- [ ] Saved-view empty/missing targets and stale/disconnected backend states are visible and recoverable.

## Verification

Test settings round trips/migration/invalid state, saved combined filters, sidebar refresh and no writes to bean files when preferences change. Verify native sidebar focus and narrow layout.

## Handoff

Provide private usage guidance for saved views/sidebar and their sharing limitations. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.
