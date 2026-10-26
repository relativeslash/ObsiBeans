---
# OB-zdg2
title: Verify baseline compatibility, parity and failure recovery
status: todo
type: task
priority: high
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T02:37:28Z
parent: OB-anxh
blocked_by:
    - OB-363m
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Acceptance scenarios for a future implementation; Reliability and accessibility requirements**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-363m--complete-accessible-keyboard-parity-and-responsive.md|OB-363m — Complete accessible keyboard parity and responsive interactions]]

## Scope and boundaries

Run integrated end-to-end acceptance on the selected Obsidian/Beans pair with verified binary identity, using a disposable vault and representative fixture projects. Do not substitute mocked backend tests or a local dev-version label for baseline support evidence.

## Acceptance criteria

- [ ] Every audited TUI action/modal and all nine numbered design acceptance scenarios have reproducible steps, observed results and evidence.
- [ ] CLI round trips confirm create/edit/filter/link operations and cross-view convergence; relationship rejections preserve data.
- [ ] Exercise agent/editor concurrent updates, lost/slow backend, malformed data, unknown fields, partial batches and post-write timeouts; drafts and outcomes stay accurate.
- [ ] Verify disable/reload/close with pending commands and unsaved edits: no orphan resources or silent draft loss.
- [ ] Run all configured headless/CI gates and supported-OS native tests; record gaps rather than falsely claiming cross-platform or full parity.
- [ ] Track each discovered defect in Beans and fix/retest it before closing this gate; update the parity evidence after changes.

## Verification

Use the scaffold’s verified commands plus the contract matrix and native test procedure. Preserve logs/version provenance and fixture instructions; do not modify live task data for acceptance.

## Handoff

Provide a private acceptance report indexed from the AI guide, with pass/fail matrix and remaining support limitations. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Verify every row of the [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|TUI parity matrix]] and rerun `test/contract/beans-0.4.2/audit.sh` against the release; the [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]] lists the facts it asserts.
