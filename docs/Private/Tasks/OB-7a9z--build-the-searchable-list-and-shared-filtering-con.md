---
# OB-7a9z
title: Build the searchable list and shared filtering controls
status: todo
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T01:45:43Z
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

- [ ] Search/filter/clear/reset, sorting and column preferences work with the adapter contract and have visible controls and keyboard access.
- [ ] Inline fields save with accurate pending/error/conflict feedback and refresh all consumers.
- [ ] Contextual ancestors are visually identified and excluded from match counts and implicit selection.
- [ ] Checkbox selection and copy current/selected IDs use full stable IDs; preserve explicit hidden selections and expose the target count and clear action.
- [ ] Avoid eager body fetches and preserve focus/scroll as data refreshes; empty project and zero matches remain distinct.

## Verification

Test combined filters, stable tie-break sorting, hierarchy context, selection across filter changes and backend readiness cases. Smoke test large lists and keyboard navigation in Obsidian.

## Handoff

Hand off shared filter and selection controls for bulk actions and alternate views. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.
