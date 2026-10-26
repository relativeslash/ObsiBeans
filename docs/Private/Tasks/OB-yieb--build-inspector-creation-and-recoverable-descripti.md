---
# OB-yieb
title: Build inspector, creation and recoverable description editing
status: todo
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T02:37:28Z
parent: OB-1bvb
blocked_by:
    - OB-s9b7
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Issue details and creation; TUI parity map**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-s9b7--build-native-workspace-navigation-and-issue-tab-li.md|OB-s9b7 — Build native workspace navigation and issue-tab lifecycle]]

## Scope and boundaries

Deliver inspect/edit title, metadata/tags, timestamps and Markdown body; quick-create and expanded forms; explicit draft creation; Save/Cancel body editing and precise checklist actions. Open source notes and copy ID/note-link actions use Obsidian resolution. No external editor in v1, per [[docs/Private/Design/ObsiBeans native workspace proposal.md#V1 decisions|V1 decisions]].

## Acceptance criteria

- [ ] Normal create shows effective project defaults, Create draft explicitly selects draft, and cancel creates no bean; validate backend errors without losing form contents.
- [ ] Field-level save feedback and Markdown/checklist display match persisted data; Save/Cancel retains recoverable text on failure or conflict.
- [ ] Conflict review presents local and fresh remote values and never blindly overwrites newer content; duplicate checklist text is handled safely.
- [ ] Source-note navigation/copy links resolve the current bean path by full ID; changing a title does not rename a file. Any separately exposed explicit rename uses Obsidian FileManager and preserves ID.
- [ ] Inspector and dedicated tabs use the same action/state behavior and render untrusted descriptions without executing their contents.

## Verification

Test all form defaults, cancellation, duplicate submits, invalid input, concurrent edits, failed/uncertain saves, duplicate checklist items and custom-frontmatter blocks. Verify rendered Markdown and source-note actions in native Obsidian.

## Handoff

Provide tested inspector/create/body-edit components and recoverable conflict flow. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Follow the [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]] decisions on explicit creation defaults, local validation, full tag replacement, and body normalization. Parity rows: TP-14 to TP-17 and TP-20 to TP-22 in the [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|TUI parity matrix]]. TP-20 and TP-21 are the labeled external-editor substitutions.
