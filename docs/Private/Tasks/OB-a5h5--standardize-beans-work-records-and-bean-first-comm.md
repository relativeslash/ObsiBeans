---
# OB-a5h5
title: Standardize Beans work records and bean-first commits
status: completed
type: task
priority: normal
created_at: 2026-10-26T11:15:51Z
updated_at: 2026-10-26T11:21:23Z
---

## Purpose and inputs

Add studio-wide Beans guidance to the shared Standards checkout, using [[docs/Private/Tasks/OB-f6ce--scaffold-the-desktop-plugin-and-executable-quality.md|OB-f6ce — Scaffold the desktop plugin and executable quality gates]] as the model requested by the owner. Read [[docs/Private/Contributing/Standards/Documentation/README.md|Documentation standards]] and [[docs/Private/Contributing/Standards/Changes.md|Standards changes]].

## Prerequisites

None. This is a shared-standards change explicitly requested by the owner, tracked in ObsiBeans; implementation files belong to the separate Standards repository.

## Scope and boundaries

Add a required Documentation/beans profile beside Obsidian, require bean-first commit subjects, define useful work-record content and lifecycle, and synchronize routing and migration guidance. Preserve the current unreleased DSE 2.0.0 draft convention. Do not change product code, rewrite existing beans/history, commit, or update the parent submodule pin.

## Acceptance criteria

- [x] Define reusable bean content, relationships, lifecycle, verification and handoff requirements modeled on the supplied example.
- [x] Require every commit subject to begin with its primary bean ID, including generated commit messages and cross-repository work.
- [x] Integrate the profile into shared routing, resolve tracker-metadata conflicts, and record adoption guidance in Changes.
- [x] Review the diff and verify changed links, rule IDs, and representative Obsidian rendering.

## Verification

Inspect both repository diffs; check stable rule IDs and profile routing; use the running ObsiBeans vault to resolve links and render the new profile. Report unexecuted checks and existing unrelated issues separately.

## Handoff

Leave reviewed standards edits and this work record uncommitted. Report the profile path, key requirements and actual validation, without claiming consumer hooks or CI enforcement were implemented.

## Summary of Changes

Added [[docs/Private/Contributing/Standards/Documentation/profiles/Beans.md|the required Documentation/beans profile]] with 17 stable rules covering tracker ownership, meaningful work records, relationships, lifecycle, evidence-based completion, handoff, and bean-first commit subjects. The body outline generalizes OB-f6ce without making shared Standards depend on an ObsiBeans note.

Updated shared and Documentation routing, added DSE-REPO-011, clarified the Beans metadata exception in DSE-OBS-006, and recorded policy/adoption changes in [[docs/Private/Contributing/Standards/Changes.md|Changes]]. Preserved the current unreleased DSE 2.0.0 draft convention.

Verification:

- Standards `git diff --check` passed; reviewed tracked edits and the new profile for scope and consistency.
- Source checks passed: unique Documentation rule definitions, 17 DSE-BEAN rules, profile link targets, balanced fences, whitespace, and required routing.
- Live Obsidian metadata resolved all 70 links across the six changed Standards notes and this bean, with no failures.
- A temporary Obsidian reading-view tab rendered representative profile headings and rule tables without unresolved links; the tab was closed. This was a DOM check, not a full visual screenshot audit.
- Vault-wide unresolved-link check found one pre-existing Standards issue: `Typescript/profiles/Web Application.md` references unresolved `Typescript/profiles/Node.js`. Left unchanged as unrelated.

Limitations and handoff:

- Documentation-only change; product build/tests were not run. No commit-message hooks or CI enforcement were installed or tested.
- Changes remain uncommitted in the separate Standards checkout; this bean remains in ObsiBeans. No parent Standards gitlink update, published-history rewrite, or existing-bean migration was performed.
- Optional follow-up: configure and verify commit-prefix enforcement and deliberate Standards revision adoption in consuming repositories. No follow-up beans were created for that separate scope.
