---
# OB-jo2i
title: Require the verify check on main
status: completed
type: task
priority: normal
created_at: 2026-10-26T09:48:22Z
updated_at: 2026-10-26T19:09:52Z
parent: OB-77pl
---

## Purpose and inputs

Follow-up from [[docs/Private/Tasks/OB-f6ce--scaffold-the-desktop-plugin-and-executable-quality.md|OB-f6ce]]. The `verify` job in `.github/workflows/ci.yml` passes on GitHub, but `main` of `relativeslash/ObsiBeans` has neither branch protection nor a ruleset, so a failing check does not block merging. Only the repository owner can change this setting.

## Acceptance criteria

- [x] A branch ruleset or protection rule on `main` requires the `verify` status check to pass before merging.
- [x] [[docs/Private/Contributing/ObsiBeans project info.md|Project information]] states that the check is required.

## Verification

`https://api.github.com/repos/relativeslash/ObsiBeans/rules/branches/main` (or the branch's `protected` field) lists the required `verify` check.

## Summary of Changes

Added a `required_status_checks` rule to the existing repository ruleset `Default PR only` (id 25877117), which targets the default branch and already blocked direct pushes, force pushes and deletion. The rule requires the `verify` check from GitHub Actions (integration 15368) in strict mode: the branch must be up to date with `main`. The ruleset has no bypass actors. [[docs/Private/Contributing/ObsiBeans project info.md|Project information]] documents the rule.

Verification on 2026-10-26: `GET /repos/relativeslash/ObsiBeans/rules/branches/main` lists `required_status_checks` with `verify`. On [PR #1](https://github.com/relativeslash/ObsiBeans/pull/1) the merge state was `BLOCKED` while `verify` ran and `CLEAN` after it passed (run 40383740183).
