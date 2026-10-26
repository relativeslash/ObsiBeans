---
# OB-piqb
title: Package the v1 candidate and complete the agent handoff
status: todo
type: task
priority: high
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T01:48:08Z
parent: OB-anxh
blocked_by:
    - OB-zdg2
    - OB-t0ve
    - OB-77pl
    - OB-478m
    - OB-1bvb
    - OB-lb80
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Acceptance scenarios for a future implementation; Evidence and compatibility baseline**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-zdg2--verify-baseline-compatibility-parity-and-failure-r.md|OB-zdg2 — Verify baseline compatibility, parity and failure recovery]]
- [[docs/Private/Tasks/OB-t0ve--measure-large-project-behavior-and-lifecycle-resou.md|OB-t0ve — Measure large-project behavior and lifecycle resource bounds]]

## Scope and boundaries

Produce a private, reproducible release candidate and verified setup/development/usage/recovery documentation. This task prepares release readiness; publishing, installing into the user’s live vault, upgrading software or enabling deferred features requires separate authorization.

## Acceptance criteria

- [ ] Build/package from a clean checkout with locked dependencies; confirm manifest, desktop-only support and version policy match tested baselines.
- [ ] Verify install/enable/reload/disable and clean rollback in a disposable supported vault; include actual artifact names and checksum/evidence where used.
- [ ] Update private setup, executable trust/config binding, saved views, draft/conflict recovery, data-preservation warnings and unsupported-feature documentation; update the AI working guide with verified module/test/debug entry points.
- [ ] Re-run affected acceptance after performance/final packaging changes and confirm required CI gates, dependencies, coverage and fitness checks pass.
- [ ] Confirm all other implementation leaves and the foundation/backend/workspace/planning epic exit reviews are complete; link final acceptance/performance evidence and request owner release-readiness review. Review the quality epic after this leaf completes, then the milestone. Do not publish without explicit authorization.

## Verification

Repeat the documented clean install/build/package and disposable-vault smoke procedure from the candidate artifacts. Validate changed vault links/metadata and final diff. Mark absent platform/version evidence as a limitation, not support.

## Handoff

Append an exact candidate artifact/evidence inventory and suggested next agent starting points. Complete this leaf and then review/close the milestone only when all exit criteria are actually met. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.
