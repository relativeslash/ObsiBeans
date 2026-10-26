---
# OB-hup8
title: Audit Beans 0.4.2 contracts and complete the TUI parity matrix
status: completed
type: task
priority: high
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T02:37:52Z
parent: OB-77pl
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Evidence and compatibility baseline; TUI parity map; Reliability and accessibility requirements**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- No implementation prerequisite. This is an initial discovery/decision task.

## Scope and boundaries

Inspect the exact selected release, not unreleased main or an unidentified local dev binary. Use version-specific source/help/schema and disposable fixtures. Capture an implementation-facing contract and an exhaustive matrix of TUI actions, inherited navigation, modal paths, cancel/error behavior and native visible/keyboard equivalents. Do not claim the earlier proposal inspection proved parity.

## Acceptance criteria

- [x] Record reproducible binary provenance and schema/help snapshots or generation procedure for the selected Beans release.
- [x] Verify queries, variables, config/defaults, tags, readiness, parent constraints, both blocking directions, missing targets, cycle checks, ETag support and real concurrency guarantees.
- [x] Verify body/checklist replacement behavior (including duplicate text), unknown frontmatter loss, title/path stability, write failure outcomes, and whether unsupported ordering is truly unavailable.
- [x] Give every parity row a stable identifier, expected result, planned leaf owner and test type; label optional external-editor substitution explicitly.
- [x] Record capability gaps and safe fallback/blocking decisions; do not invent mutation atomicity or preservation guarantees.

## Verification

Run scripted read/write/conflict experiments only in temporary projects, and exercise TUI modal/navigation paths interactively where needed. Record commands and fixture outputs; uncertainty remains a gate, not success.

## Handoff

Provide contract fixtures and a traceable parity matrix for adapter implementation and final baseline acceptance. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Summary of Changes

Audited the official Beans v0.4.2 release (Linux x86_64 asset; tag commit 670ecf3; archive and binary SHA-256 recorded) against its tagged source.

- [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]] records provenance, invocation, data model, queries, mutations, ETags and concurrency, frontmatter loss, missing ordering, and an adapter decision table naming an owner bean for each gap.
- [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|Beans 0.4.2 TUI parity matrix]] has rows TP-01 to TP-28, each with expected native result, owner bean and test type. TP-20 and TP-21 are labeled external-editor substitutions.
- `test/contract/beans-0.4.2/audit.sh` downloads and verifies the release, diffs committed help and schema snapshots, and asserts facts BC-00a to BC-44, all in temporary projects.
- Links from the design note, project information, AI guide and docs index. Contract inputs appended to OB-41mc, OB-8jei, OB-os2h, OB-yieb, OB-op2n, OB-7a9z, OB-26rz, OB-uqrv, OB-s9b7, OB-363m and OB-zdg2.

Main findings: queried ETags are rejected for non-canonical files (including any bean created without a priority); GraphQL validates no field values and ignores config defaults on create; updates drop unknown frontmatter and comments; blocking links are stored in two directions that relationship fields and the TUI each show only partly; mixed-direction blocking cycles are accepted and not reported by `beans check`; every Markdown file under the task root is loaded as a bean and one malformed file fails all commands; there is no cross-process write lock and writes are not atomic.

Verification: `test/contract/beans-0.4.2/audit.sh` ended with `PASS: Beans 0.4.2 contract holds`, exit 0. With one snapshot altered it reported `FAIL BC-02-help-and-schema-snapshots`, exit 1, and the snapshot was then restored. TUI paths were exercised in tmux at 150 columns: Esc on a plain list quits, `q` typed into a picker filter quits, `p` on a milestone does nothing, the detail view omits links stored in `blocked_by`, and bulk edits clear the selection. `obsidian vault=ObsiBeans unresolved verbose` showed no new unresolved links.

Limitations: only the Linux x86_64 asset was audited. Truncated writes and a lost cross-process update were inferred from source, not reproduced. Matrix rows not marked observed rest on source reading. The new notes were checked by source and link resolution, not visually in reading view. The audit script needs network access.

Agent-made decisions within the design, open to owner review: new beans default to type `task` when `default_type` is absent (the CLI uses `milestone`); search input is escaped as plain text; selection stays after a bulk edit until cleared. No follow-up beans were created.
