---
# OB-rmmo
title: Build note links, backlinks and selected-text conversion
status: todo
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T01:45:43Z
parent: OB-lb80
blocked_by:
    - OB-yieb
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **ALM-style additions; Issue details and creation; Data ownership**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-yieb--build-inspector-creation-and-recoverable-descripti.md|OB-yieb — Build inspector, creation and recoverable description editing]]

## Scope and boundaries

Integrate Obsidian-resolved related notes/backlinks, insert-bean-link and convert-selected-note-text commands. Define a preview/confirmation and safe two-step outcome for bean creation plus optional source-note insertion; preserve the selected source text unless the user explicitly chooses replacement.

## Acceptance criteria

- [ ] Convert selection to a bean with a source-note link after confirmation, using effective defaults and safe Markdown/link handling.
- [ ] Insert a bean link at the intended editor location only after validating the current note/selection; cancellation has no side effects.
- [ ] Handle bean-created/note-insert-failed outcomes with a recoverable link and no duplicate creation on retry; concurrent editor changes do not overwrite user text.
- [ ] Related notes/backlinks and source-note actions use Obsidian resolution and remain correct after link-aware note/bean moves preserving bean IDs.
- [ ] All commands have discoverable controls/palette entries and avoid execution of note text or paths.

## Verification

Test escaped/special-character filenames, renamed targets, absent editor, empty selection, concurrent note edits and partial create/insert failures in a disposable native vault.

## Handoff

Provide safe note-conversion/insertion documentation and fixtures for link integrity acceptance. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.
