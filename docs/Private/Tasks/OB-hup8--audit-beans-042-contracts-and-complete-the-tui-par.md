---
# OB-hup8
title: Audit Beans 0.4.2 contracts and complete the TUI parity matrix
status: todo
type: task
priority: high
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T01:45:43Z
parent: OB-77pl
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Evidence and compatibility baseline; TUI parity map; Reliability and accessibility requirements**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- No implementation prerequisite. This is an initial discovery/decision task.

## Scope and boundaries

Inspect the exact selected release, not unreleased main or an unidentified local dev binary. Use version-specific source/help/schema and disposable fixtures. Capture an implementation-facing contract and an exhaustive matrix of TUI actions, inherited navigation, modal paths, cancel/error behavior and native visible/keyboard equivalents. Do not claim the earlier proposal inspection proved parity.

## Acceptance criteria

- [ ] Record reproducible binary provenance and schema/help snapshots or generation procedure for the selected Beans release.
- [ ] Verify queries, variables, config/defaults, tags, readiness, parent constraints, both blocking directions, missing targets, cycle checks, ETag support and real concurrency guarantees.
- [ ] Verify body/checklist replacement behavior (including duplicate text), unknown frontmatter loss, title/path stability, write failure outcomes, and whether unsupported ordering is truly unavailable.
- [ ] Give every parity row a stable identifier, expected result, planned leaf owner and test type; label optional external-editor substitution explicitly.
- [ ] Record capability gaps and safe fallback/blocking decisions; do not invent mutation atomicity or preservation guarantees.

## Verification

Run scripted read/write/conflict experiments only in temporary projects, and exercise TUI modal/navigation paths interactively where needed. Record commands and fixture outputs; uncertainty remains a gate, not success.

## Handoff

Provide contract fixtures and a traceable parity matrix for adapter implementation and final baseline acceptance. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.
