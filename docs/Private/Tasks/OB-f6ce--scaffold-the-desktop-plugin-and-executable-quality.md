---
# OB-f6ce
title: Scaffold the desktop plugin and executable quality gates
status: todo
type: task
priority: high
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T01:45:43Z
parent: OB-77pl
blocked_by:
    - OB-wzgt
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Architecture proposal; Reliability and accessibility requirements**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-wzgt--resolve-v1-scope-and-interaction-decisions.md|OB-wzgt — Resolve v1 scope and interaction decisions]]

## Scope and boundaries

Create the minimal TypeScript Obsidian plugin project, build/test structure and dependency boundaries selected by the scope task. Pin a verified stable Yarn/toolchain and compatible API dependencies under Engineering/Build and Dependencies; do not silently upgrade the fixed product baseline. Do not introduce placeholder standards notes or copy shared rules.

## Acceptance criteria

- [ ] Document exact Node/Yarn/API/build/test versions and selection evidence in project information; commit one Yarn lockfile, catalogs and enforcing constraints.
- [ ] Provide desktop-only manifest, native view/command/settings lifecycle skeleton and a reproducible development bundle that loads and unloads on the target Obsidian version.
- [ ] Provide headless type, lint, unit/integration, coverage, dependency and type-size/architecture fitness gates in required CI; validate the gates fail on representative violations.
- [ ] Apply inherited per-module and changed-code coverage defaults; initial production code counts as new. Separate native-window tests, benchmarks and release packaging from normal headless checks.
- [ ] Record actual setup, test, build and reload commands in project information/AI guide, with production code and test fixture locations.

## Verification

Run fresh deterministic install, configured headless checks and bundle creation; load/reload the minimal plugin in a disposable target-version vault and inspect runtime errors. Do not invent command names in documentation before verifying them.

## Handoff

Hand off the working skeleton, declared module boundaries, test helpers and actual CI/local commands. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.
