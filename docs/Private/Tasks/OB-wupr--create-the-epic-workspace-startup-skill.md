---
# OB-wupr
title: Create the epic workspace startup skill
status: completed
type: task
priority: normal
created_at: 2026-10-26T17:03:28Z
updated_at: 2026-10-26T17:09:06Z
---

## Purpose and inputs

Create the requested first-read Protomatter workspace skill in `/home/whisper2shade/Dev/AI/protomatter-skills/`, following the owner's agreed AGENT_WORKSPACE and epic-specific clone workflow. The skills repository has no Beans tracker; this ObsiBeans record tracks the cross-repository work.

## Scope and prerequisites

Read the target collection's existing skill layout and skill-creator guidance. Create a reusable startup skill; update collection discovery and relevant existing skill routing. No project clone creation, environment configuration, global skill installation, commits, pushes, or shared Standards changes. The owner explicitly requested this direct skills-repository edit; AGENT_WORKSPACE is currently unset and the new workflow is not yet installed.

## Acceptance criteria

- [x] Specify primary-repository discovery, epic/task selection, AGENT_WORKSPACE path checks, clone creation/resume, exclusive claims, and subagent inheritance.
- [x] Preserve user work and handle missing/unpublished beans, wrong repositories, partial clones, dirty state, and exact tool/vault targeting safely.
- [x] Make first-read routing discoverable without claiming a skill alone enforces loading order.
- [x] Validate the skill format, supporting links, changed-file scope, and representative workflow scenarios.

## Verification and handoff

Use the skill-creator validator and inspect diffs. Review safe outcomes for new/resumed/inherited workspaces and blocked cases. Leave changes uncommitted; report prerequisites and any activation/adoption gaps separately.

## Summary of Changes

Created `skills/protomatter-workspace/SKILL.md` in `/home/whisper2shade/Dev/AI/protomatter-skills/`. The cross-agent skill establishes the first-read workflow for primary-repository discovery followed by execution in an independent `<repo_name>-<epic_id>` clone under AGENT_WORKSPACE, with task-ID fallback.

It covers canonical identity, safe paths, atomic workspace claims, exclusive coordination, new/resumed clones, pinned recursive submodules, unpublished inputs, inherited subagent context, exact Beans/Obsidian targeting, preservation, handoff and authorized cleanup. README installation/startup guidance and the existing Beans/navigation skills now route to it before mutations.

Verification:

- Skill-creator validation passed for the new skill and both edited companion skills; final diff whitespace checks passed.
- Local prose links and code-fence checks passed in all four changed files. Illustrative code was excluded from link resolution after an initial checker mistook an existing relative-link example for a real link.
- An independent read-only skill evaluation exercised seven scenarios: unset environment, unpublished inputs, another session's claim with dirty work, delegated inheritance, wrong origin, missing pinned Standards, and unavailable clone-local Obsidian vault. No blocking contradiction was found.
- Addressed two review findings: explicitly distinguished controlled bootstrap writes from project writes, and required resumed clones to be checked for borrowed object stores and Git environment redirection.

Limits and handoff:

- These are authored instructions, not an executable provisioning tool. No end-to-end agent session or clone/lock workflow was executed in this task, and no CLI installer was run.
- Changes are uncommitted in the skills repository; this work record is in ObsiBeans. No global skills installation, startup-instruction edit, AGENT_WORKSPACE assignment, project clone, push or Standards update was performed.
- AGENT_WORKSPACE is currently unset. To activate, install the new/updated skills, set the environment variable, and add the documented first-read instruction to the chosen host/project startup instructions.
- Pinned Standards requiring an unsuffixed repository vault name still need explicit alignment for epic-suffixed clone vaults; the skill reports rather than silently waives that conflict. No follow-up bean was created for activation or Standards adoption.
