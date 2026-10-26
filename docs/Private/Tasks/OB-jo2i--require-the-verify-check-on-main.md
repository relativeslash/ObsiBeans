---
# OB-jo2i
title: Require the verify check on main
status: todo
type: task
priority: normal
created_at: 2026-10-26T09:48:22Z
updated_at: 2026-10-26T09:48:22Z
parent: OB-77pl
---

## Purpose and inputs

Follow-up from [[docs/Private/Tasks/OB-f6ce--scaffold-the-desktop-plugin-and-executable-quality.md|OB-f6ce]]. The `verify` job in `.github/workflows/ci.yml` passes on GitHub, but `main` of `relativeslash/ObsiBeans` has neither branch protection nor a ruleset, so a failing check does not block merging. Only the repository owner can change this setting.

## Acceptance criteria

- [ ] A branch ruleset or protection rule on `main` requires the `verify` status check to pass before merging.
- [ ] [[docs/Private/Contributing/ObsiBeans project info.md|Project information]] states that the check is required.

## Verification

`https://api.github.com/repos/relativeslash/ObsiBeans/rules/branches/main` (or the branch's `protected` field) lists the required `verify` check.
