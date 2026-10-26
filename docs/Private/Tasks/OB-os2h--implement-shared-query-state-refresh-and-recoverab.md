---
# OB-os2h
title: Implement shared query state, refresh and recoverable drafts
status: completed
type: task
priority: high
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T21:47:28Z
parent: OB-478m
blocked_by:
    - OB-41mc
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Architecture proposal; Data ownership; Reliability and accessibility requirements**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-41mc--implement-validated-beans-reads-and-conflict-safe.md|OB-41mc — Implement validated Beans reads and conflict-safe mutations]]

## Scope and boundaries

Create one shared application/action layer for all views and commands. Cache only disposable backend data; store preferences separately and recoverable drafts according to the scope decision. Keep stable identity distinct from note filename/title.

## Acceptance criteria

- [x] Synchronize filters, selected ID, per-view scroll/focus state and explicit selection sets across list/board/hierarchy/inspector.
- [x] Debounce relevant vault create/modify/rename/delete/config events, support explicit refresh, suppress stale query responses, and reconcile external CLI/agent/editor changes.
- [x] Distinguish loading, empty project, no matches, disconnected/invalid data, stale cache/last refresh, pending save, failed save and conflict.
- [x] Prevent repeated-click duplicate mutations; reconcile failures without treating optimistic state as saved data.
- [x] Retain draft text across failures, conflicts and close/reload according to the approved policy, with explicit save/discard/recovery; dispose listeners/timers/subscriptions cleanly.

## Verification

Test out-of-order queries, rapid project/filter switches, external edits, config changes, refresh bursts, repeated actions, persisted draft restoration and unload/reload resource cleanup. Include real vault-event integration evidence.

## Handoff

Document public state/action contracts, draft storage/recovery and fixture helpers for feature implementers. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Follow the [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]] decisions for load failures, uncertain writes, and parse-retry on refresh. Parity rows: TP-23, TP-26, TP-28 in the [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|TUI parity matrix]].

## Summary of Changes

Delivered the shared state and action layer in `src/state/` and wired it into the plugin shell. The contracts, draft storage and test helpers are documented in [[docs/Private/Guides/ObsiBeans AI working guide.md#Shared state|the AI working guide]].

- **State layer.** `WorkspaceState` holds the disposable project cache, filters, the inspected bean, an explicit selection set (hidden members counted separately), per-view scroll and focus, pending/failed/conflict/uncertain save states, notices and drafts, and publishes immutable snapshots. `Loader` owns debouncing, newest-wins loading with abort, and the single parse retry. Distinct `loading`, `empty`, `no-matches`, `ready`, `disconnected` and `invalid-data` statuses, with stale cached rows and a last-refresh time when only a refresh failed (TP-28).
- **Refresh.** The shell routes vault create, modify, delete and rename events under the task root, plus an explicit Refresh command, into one debounced load (TP-26). A removed selected bean is flagged, and removed members leave the selection with a dismissible notice. Obsidian reports no events for `.beans.yml`, so every load compares the config content with the binding and rebinds when it changed.
- **Writes.** One pending write per bean or form; repeated clicks are ignored. Nothing is shown as saved until Beans confirms. After an `uncertain` result the key refuses writes until dismissed.
- **Drafts.** Description and creation drafts record key, text, basis revision and time. They are written next to the settings in `data.json` through one serialized write, flushed on dispose, kept after failures and conflicts, and restored without overwriting (`changed` opens conflict review, `orphaned` stays listed).
- **Adapter additions.** `listBeans` returns `blockedIds` and `readyIds`, because readiness exists only as a backend filter; `Binding` gained `taskRootInVault`, `configInVault` and `configDigest`, and `configUnchanged`. The contract note records both.
- **Selection** (TP-23) is a state contract; the checkbox views are OB-26rz's.

### Verification

Run in the epic clone on Linux, Obsidian 1.14.5:

- `OBSIBEANS_BEANS_RELEASE=<audited v0.4.2 release binary, sha256 checked> yarn verify`: install, constraints, dedupe, `svelte-check` (0 errors, 0 warnings), lint, type-size (99 types, 0 failures), architecture (0 violations), 288 tests passed in 18 files including the 19 real-binary tests, coverage 98.86% statements, 94.88% branches, changed-code gates passed for adapter, plugin, state and views.
- `yarn test:native`: all checks passed, including the new ones: the project loads through the real vault adapter; a file created, modified, renamed and deleted outside Obsidian reaches the shared state; the Refresh command reloads; a changed `.beans.yml` is noticed by a refresh and rebinds; after disabling the plugin a file change reaches no state and no Beans process remains.
- Real-binary adapter test: `readiness` agrees with the `--ready` and `isBlocked` filters on the v0.4.2 release (and on the development build).
- Mutation checks: removing the stale-answer guard, the busy guard, the uncertain guard, the failed-save draft retention or the supersede-on-write each made at least one test fail.

### Limitations

- No view reads the state yet; the workspace view still shows only "no project bound". Wiring is OB-s9b7 onward.
- Search matches title, ID, slug and tags, not descriptions (rows carry no body). Backend body search and query escaping remain OB-7a9z's.
- A config change is noticed at the next load or Refresh, not at once, because Obsidian emits no events for dot-files. The stub-level test also covers the case where Obsidian does report it.
- `blockedIds` and `readyIds` are complete only for an unfiltered list. A blocker that does not exist does not block; this was observed on a development build only.
- Draft writes during unload cannot be awaited by Obsidian; the write is started and normally completes. A crash inside the 400 ms window loses the newest keystrokes.
- Windows and macOS are untested.

Follow-up beans: none created. OB-s9b7 and OB-7a9z should consume this state and extend search respectively.
