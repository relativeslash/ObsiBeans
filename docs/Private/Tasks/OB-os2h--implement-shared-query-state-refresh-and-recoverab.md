---
# OB-os2h
title: Implement shared query state, refresh and recoverable drafts
status: todo
type: task
priority: high
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T02:37:28Z
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

- [ ] Synchronize filters, selected ID, per-view scroll/focus state and explicit selection sets across list/board/hierarchy/inspector.
- [ ] Debounce relevant vault create/modify/rename/delete/config events, support explicit refresh, suppress stale query responses, and reconcile external CLI/agent/editor changes.
- [ ] Distinguish loading, empty project, no matches, disconnected/invalid data, stale cache/last refresh, pending save, failed save and conflict.
- [ ] Prevent repeated-click duplicate mutations; reconcile failures without treating optimistic state as saved data.
- [ ] Retain draft text across failures, conflicts and close/reload according to the approved policy, with explicit save/discard/recovery; dispose listeners/timers/subscriptions cleanly.

## Verification

Test out-of-order queries, rapid project/filter switches, external edits, config changes, refresh bursts, repeated actions, persisted draft restoration and unload/reload resource cleanup. Include real vault-event integration evidence.

## Handoff

Document public state/action contracts, draft storage/recovery and fixture helpers for feature implementers. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Follow the [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]] decisions for load failures, uncertain writes, and parse-retry on refresh. Parity rows: TP-23, TP-26, TP-28 in the [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|TUI parity matrix]].
