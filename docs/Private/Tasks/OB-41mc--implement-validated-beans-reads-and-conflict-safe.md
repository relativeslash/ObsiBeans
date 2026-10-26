---
# OB-41mc
title: Implement validated Beans reads and conflict-safe mutations
status: completed
type: task
priority: high
tags:
    - v1
created_at: 2026-10-26T01:45:43Z
updated_at: 2026-10-26T20:51:10Z
parent: OB-478m
blocked_by:
    - OB-8jei
---

## Purpose and inputs

Implement the [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]], especially **Data ownership; Issue details and creation; Reliability and accessibility requirements**. Read [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]], [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], and the parent milestone's execution rules before starting. This record describes future work, not implemented behavior.

## Prerequisites

- [[docs/Private/Tasks/OB-8jei--implement-trusted-project-binding-and-bounded-proc.md|OB-8jei — Implement trusted project binding and bounded process execution]]

## Scope and boundaries

Implement the version-aware typed Beans adapter over verified CLI/GraphQL contracts. Centralize field, tag, parent, blocker and body/checklist mutation behavior here. Use variables, response validation and stable full IDs; no parallel YAML serializer or issue database. Implement the preservation decision before enabling any unsafe write.

## Acceptance criteria

- [x] Expose validated list/detail/filter/readiness/relationship reads and effective defaults without eagerly loading every body.
- [x] Implement create, title/status/type/priority/tags, parent set/remove, blocking add/remove and body/checklist updates through supported backend operations.
- [x] Use supported ETags/preconditions and document any unguardable creation/mutation path; return distinct validation, backend, preservation, conflict and uncertain-outcome errors.
- [x] Reject unsafe frontmatter writes per the approved policy; never silently strip fields. Checklist edits target one intended item; ambiguous duplicate text cannot be arbitrarily replaced.
- [x] On mismatches preserve caller drafts and support remote refresh/review; ambiguous post-timeout writes require reconciliation rather than blind retry. No archive/delete/manual-order mutation is exposed.

## Verification

Run fixtures for normal/error responses, schema drift, Unicode and escaping; real selected-version round trips and competing writers in disposable projects. Verify both relationship directions, rejected cycles, failed writes, duplicate checklist text and custom-field preservation policy.

## Handoff

Hand off typed queries/mutations, validated data shapes and error semantics with real backend contract tests. Update affected documentation with verified facts and append a Summary of Changes with commands, results, limitations, and follow-up bean IDs. Do not complete with unchecked acceptance items or unreported required verification gaps.

## Contract inputs

Implement the [[docs/Private/Design/Beans 0.4.2 contract.md|Beans 0.4.2 contract]] adapter decisions owned by this bean: ifMatch computed from raw file bytes, blocking of lossy frontmatter, local value validation, one mutation per call, duplicate-ID blocking, error classification, and re-reading after uncertain writes. The release behavior is asserted by `test/contract/beans-0.4.2/audit.sh`. Parity rows: TP-15 in the [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|TUI parity matrix]].

## Summary of Changes

Delivered the typed Beans adapter: validated reads and conflict-safe mutations, in `src/adapter/`.

- `beans-model.ts`: the fixed status/type/priority lists, `BeanSummary`/`BeanDetail`, local value validation, and the error variants `validation`, `conflict`, `preservation`, `backend` and `uncertain` (`Outcome<T>`).
- `beans-graphql.ts`: `runGraphql` sends user data only as GraphQL variables (the query text is always an adapter constant, requests over 100 000 bytes are refused before spawning) and `classifyMessage` maps Beans' message prefixes to failure reasons.
- `beans-read.ts`: `listBeans` (optional filter, `READY_FILTER` for readiness, no bodies), `getBean`, `blockingGraph` (merges both stored blocking directions) and `indexTaskRoot`. Each bean carries a `revision` (FNV-1a 64 of its file bytes) and `problems` (`invalid-file`, `duplicate-id`, `unreadable`, `bad-value`). Effective defaults come from `Binding.defaults`, which `binding.ts` now reads from `default_status` and `default_type`.
- `beans-guard.ts`: `fnv1a64` and `unsafeReason`, which refuses frontmatter Beans would damage (unknown keys, comments other than `# <id>`, no valid status or unknown type or priority). CRLF, key order and missing defaults pass.
- `beans-write.ts`: `mutateBean` applies one `Change` (fields, body, one checklist item, parent set or clear, blocking add or remove in either stored field) as one Beans mutation. It compares the file with the caller's `revision` first and sends the same value as `ifMatch`. `createBean` always sends explicit status, type and priority. No archive, delete or ordering call exists.
- Conflict handling: a changed file or a Beans ETag or body mismatch is a `conflict` carrying the current bean, never retried. After a failure that may have written, the file bytes are compared with the revision: unchanged gives a plain backend failure, otherwise `uncertain` with the re-read bean (`createdIds` for creation). The caller's input is never consumed.
- Documentation: contract note (implemented rows, plus the new fact that a mutation's answer lacks the body's leading newline, so every successful write is read back), project information, AI working guide.

Verification (Linux, Node 26.8.1):

- `yarn verify` passes: typecheck, lint, fitness, 186 tests (19 skipped without a binary), coverage gates (adapter 100 % lines, 94.9 % branches).
- `OBSIBEANS_BEANS_RELEASE=<binary> yarn vitest run test/adapter/beans-release.test.ts test/adapter/beans-adapter-release.test.ts` passes 19 of 19 against both the audited 0.4.2 release (tarball and binary SHA-256 checked against the contract note) and the developer's `dev` build: round trips of every change kind, Unicode and escaping, a bean without a priority line, both blocking directions and readiness, a same-direction cycle, invalid parent type, duplicate IDs, custom frontmatter and comments, repeated checklist text, a stale revision and three concurrent writers from one revision.
- `yarn test:native` passes.
- Fake-Beans tests cover schema drift, malformed output, every error class, timeout, cancellation, missing executable, failed and partial writes, and uncertain creation.

Limitations:

- Beans has no `ifMatch` for `createBean`, so creation is unguarded. After a failed creation the caller must check `createdIds` before retrying.
- Beans has no cross-process lock (contract note), so two writers that both pass the check in a narrow window can both succeed. The real-binary test only asserts that at least one wins and every loser is a `conflict`.
- Mixed-direction blocking cycles are not checked locally (OB-op2n), nor are type changes against parent and children (OB-op2n, OB-yieb). `search` is passed to Beans as raw Bleve syntax (OB-7a9z). Re-reading a failed parse after the debounce belongs to OB-os2h.
- A `#` inside a multi-line quoted scalar is reported as a comment, which only blocks the bean.
- The output-limit and task-root-too-large paths are classified but not exercised by an adapter test; the process layer's own tests cover the limit.
- Only Linux was tested.

Follow-up beans: none created.
