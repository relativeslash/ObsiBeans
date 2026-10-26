---
# OB-41mc
title: Implement validated Beans reads and conflict-safe mutations
status: todo
type: task
priority: high
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T02:37:27Z
parent: OB-478m
blocked_by:
    - OB-8jei
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Data ownership; Issue details and creation; Reliability and accessibility requirements**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-8jei--implement-trusted-project-binding-and-bounded-proc.md|OB-8jei — Implement trusted project binding and bounded process execution]]

## Scope and boundaries

Implement the version-aware typed Beans adapter over verified CLI/GraphQL contracts. Centralize field, tag, parent, blocker and body/checklist mutation behavior here. Use variables, response validation and stable full IDs; no parallel YAML serializer or issue database. Implement the preservation decision before enabling any unsafe write.

## Acceptance criteria

- [ ] Expose validated list/detail/filter/readiness/relationship reads and effective defaults without eagerly loading every body.
- [ ] Implement create, title/status/type/priority/tags, parent set/remove, blocking add/remove and body/checklist updates through supported backend operations.
- [ ] Use supported ETags/preconditions and document any unguardable creation/mutation path; return distinct validation, backend, preservation, conflict and uncertain-outcome errors.
- [ ] Reject unsafe frontmatter writes per the approved policy; never silently strip fields. Checklist edits target one intended item; ambiguous duplicate text cannot be arbitrarily replaced.
- [ ] On mismatches preserve caller drafts and support remote refresh/review; ambiguous post-timeout writes require reconciliation rather than blind retry. No archive/delete/manual-order mutation is exposed.

## Verification

Run fixtures for normal/error responses, schema drift, Unicode and escaping; real selected-version round trips and competing writers in disposable projects. Verify both relationship directions, rejected cycles, failed writes, duplicate checklist text and custom-field preservation policy.

## Handoff

Hand off typed queries/mutations, validated data shapes and error semantics with real backend contract tests. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Implement the [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]] adapter decisions owned by this bean: ifMatch computed from raw file bytes, blocking of lossy frontmatter, local value validation, one mutation per call, duplicate-ID blocking, error classification, and re-reading after uncertain writes. The release behavior is asserted by `test/contract/beans-0.4.2/audit.sh`. Parity rows: TP-15 in the [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|TUI parity matrix]].
