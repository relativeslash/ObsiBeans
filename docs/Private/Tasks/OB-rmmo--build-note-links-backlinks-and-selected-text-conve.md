---
# OB-rmmo
title: Build note links, backlinks and selected-text conversion
status: completed
type: feature
priority: normal
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-27T19:20:16Z
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

- [x] Convert selection to a bean with a source-note link after confirmation, using effective defaults and safe Markdown/link handling.
- [x] Insert a bean link at the intended editor location only after validating the current note/selection; cancellation has no side effects.
- [x] Handle bean-created/note-insert-failed outcomes with a recoverable link and no duplicate creation on retry; concurrent editor changes do not overwrite user text.
- [x] Related notes/backlinks and source-note actions use Obsidian resolution and remain correct after link-aware note/bean moves preserving bean IDs.
- [x] All commands have discoverable controls/palette entries and avoid execution of note text or paths.

## Verification

Test escaped/special-character filenames, renamed targets, absent editor, empty selection, concurrent note edits and partial create/insert failures in a disposable native vault.

## Handoff

Provide safe note-conversion/insertion documentation and fixtures for link integrity acceptance. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Summary of Changes

Built in the epic clone on branch `OB-lb80--planning-views-and-obsidian-integration`.

- **Related notes and backlinks:** `Notes.svelte` in the inspector lists the notes Obsidian resolves as linking to the bean file and the notes the file links to (`NoteActions.related`, from `metadataCache.resolvedLinks`; refreshed when Obsidian reports `resolved`). Notes open in a tab.
- **Insert bean link** and **Convert selection to bean:** editor commands and editor context-menu items, available only with a note editor and bound project (conversion also needs a selection). Both dialogs are Svelte components in Obsidian modals (`note-modal.ts`).
- **Safe writes:** a command captures the selection with 40 characters of context (`src/state/note-text.ts`); `NoteTarget.insert` writes only where that context still matches (or matches in exactly one other place) in the same open editor, and otherwise writes nothing.
- **Conversion outcome:** preview and confirmation first; the bean is created once through `WorkspaceState.create`; the note choice is add link after the selection (default), leave unchanged, or replace the selection. If the note write is refused the dialog keeps the bean, shows the link, and retries only the note write.
- Design decisions are recorded in the design note's "Note links and selected-text conversion" section; module facts in project information and the AI working guide.

### Verification

- `yarn verify` (install check, typecheck, lint, fitness, coverage with changed-code gates): pass. New tests: `test/state/note-text.test.ts`, `test/plugin/notes.test.ts`, `test/views/note-dialogs.test.ts`, plus updated shell and inspector tests. They cover special characters in titles and aliases, absent editor and project, empty selection, replaced file in a tab, concurrent edits (text edited, text moved, ambiguous), a partial create/insert failure with retry and no second creation, an uncertain creation and a rejected one.
- `yarn test:native` (Obsidian 1.14.5, Linux, disposable vault): pass, including related notes from real link resolution, a link-aware note move and bean-file move (ID kept, link rewritten), the editor context menu, Insert bean link, Convert selection, a concurrent edit that is not overwritten, and the retry that writes once.
- Not run: the release-binary tests (`OBSIBEANS_BEANS_RELEASE`); no adapter code changed. The docs link check with `obsidian unresolved` was not run because the clone is not registered as an Obsidian vault; the one new heading link was checked by search.
- Also changed: the type-size gate's real-repository test now has a 30 s timeout; it exceeded the 5 s default under the parallel coverage run.

### Limitations

- Editors that are not a workspace tab (canvas cards, embedded editors) cannot be written to and report that the note is no longer open.
- Closing the conversion dialog while the creation is pending still performs the note write afterwards, but a refused write is not shown.
- Related notes include bean-to-bean links. Backlinks scan every note's resolved links per read; fine at the sizes tested, index them if vaults grow large.
- Windows and macOS are untested, as before.

No follow-up beans created.
