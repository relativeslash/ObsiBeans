---
# OB-wzgt
title: Resolve v1 scope and interaction decisions
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

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Open decisions; ALM-style additions; Data ownership**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- No implementation prerequisite. This is an initial discovery/decision task.

## Scope and boundaries

Record a focused decision section in the accepted design (or linked focused design note), not a competing product specification. Recommended starting choices, not yet approvals: one explicitly bound repository with its task root inside the active vault; plugin-local saved views; external editor disabled initially; normal creation uses the effective project default and Create draft forces draft; unsafe custom frontmatter blocks mutations until a verified preservation policy exists. Decide optional parent swimlanes explicitly. Choose the native-view UI approach and module boundaries without defaulting to a standalone web stack. Ask the owner to resolve consequential ambiguity before dependent behavior is implemented.

## Acceptance criteria

- [ ] Record accepted answers for repository/task-root scope, external editor, saved-view sharing, creation defaults, unsafe frontmatter and optional swimlanes, with rationale and review triggers.
- [ ] Define saved-filter fields and migration behavior, progress leaf/descendant counting (completed versus scrapped), hidden-selection behavior, and draft recovery on close/reload.
- [ ] Define supported desktop OS test scope, UI approach and action/state/adapter boundaries; keep exact runtime/toolchain pins in project information.
- [ ] Map all required v1 capabilities and deferred/optional items to this backlog; if an optional capability is selected, refine its affected leaf before coding it.

## Verification

Review the decision record against every Open decisions item and the owner-approved scope. Obtain owner input for unresolved product choices; do not mark the gate complete while required choices remain unresolved.

## Handoff

Hand off concrete decisions and interface boundaries to scaffold and feature work; update downstream acceptance criteria when a decision changes them. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.
