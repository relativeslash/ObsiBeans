---
# OB-fgjv
title: ObsiBeans v1 native workspace
status: todo
type: milestone
priority: high
tags:
    - v1
created_at: 2026-10-26T01:45:42Z
updated_at: 2026-10-26T01:45:43Z
blocked_by:
    - OB-77pl
    - OB-478m
    - OB-1bvb
    - OB-lb80
    - OB-anxh
---

## Outcome

Deliver the owner-approved [[docs/Private/Design/ObsiBeans native workspace proposal.md|accepted v1 design]] as the first native desktop Obsidian workspace over Beans. The owner accepted the proposal as version 1 and requested this implementation plan on 2026-10-26. Acceptance authorizes planning; this milestone does not claim working software or settle the design's open decisions.

Audience: future implementation agents and the project owner. Beans owns work status and dependencies; the design owns product decisions. [[docs/Private/Contributing/ObsiBeans project info.md|compatibility and project information]] owns fixed compatibility targets (Obsidian Desktop 1.14.5 and Beans 0.4.2), not a claim of tested support. No source/build toolchain exists at planning time.

## Scope

Include native list, board, hierarchy, inspector and issue tabs; audited TUI parity; safe creation/editing/relationships/bulk actions; shared filters and saved views; progress summaries; note conversion/insertion; ready/in-progress sidebar; accessibility, conflicts, lifecycle and release evidence. Include editable tags. Optional external editor and board swimlanes are decision-gated, not silently required or silently discarded.

Manual persisted card ordering, archive/delete, mobile, assignees, sprints, estimates, comments, permissions and audit history are not initial enabled features. External task roots, multiple repositories and saved-view sharing require an explicit scope decision before implementation; they are not implied support. Do not add a separate issue database, terminal wrapper, HTTP service requirement, or standalone web-app stack.

## Agent execution rules

1. Start at AGENTS.md, [[docs/Private/Guides/ObsiBeans AI working guide.md|AI working guide]], this milestone, the chosen leaf bean and its prerequisite handoffs. Load shared standards contextually; absent optional override notes are not blockers.
2. Work on ready leaf tasks/features, not epic containers. Set the leaf in-progress only when work begins. Parent links group scope; blocked-by links enforce prerequisites. Container blockers represent exit gates, never prerequisites for their own children.
3. Decisions and contract evidence precede dependent code. Confirm open product choices with the owner when needed; do not interpret this plan's recommendations as accepted decisions. Record decisions in design documentation and toolchain selections in direct contributing notes.
4. Use Beans for issue mutations and Obsidian for resolved links and explicit file moves. Full IDs are identity. Never mutate the live project tracker as a test fixture. Use disposable fixture projects and vaults; do not install, upgrade, publish, archive or delete user data implicitly.
5. Every implementation leaf includes focused automated tests as it is built; the final QA phase integrates evidence rather than postponing testing. Inherit TypeScript, relevant JSON/localization, Engineering and Documentation/obsidian rules. Load applicable profiles based on actual capability; this design does not select a web application framework.
6. Preserve unrelated working-tree changes. Update documentation with real commands only after they exist. Completion requires acceptance evidence and a Summary of Changes; log defects and keep dependent gates blocked until they are resolved.
7. Dependency-independent leaves may proceed separately after prerequisites complete. Coordinate shared action/state interfaces and avoid concurrent edits to the same bean or integration file. Do not launch additional agents solely because this plan permits independent work.

## Release exit criteria

- [ ] All executable descendants and epic exit gates are complete with test evidence.
- [ ] The supported binary and Obsidian pair pass the parity matrix and all nine design acceptance scenarios.
- [ ] Data integrity, conflict recovery, per-bean bulk outcomes, accessibility, responsiveness and unload/reload behavior are verified.
- [ ] Reproducible build/package and private setup, development, recovery and support documentation are complete; remaining limitations are explicit.
- [ ] The owner reviews release readiness. Packaging is not permission to publish or enable deferred destructive actions.


## Work index

- [[docs/Private/Tasks/OB-77pl--v1-foundation-and-compatibility-contracts.md|OB-77pl — V1 foundation and compatibility contracts]]
- [[docs/Private/Tasks/OB-478m--v1-safe-beans-integration-and-shared-state.md|OB-478m — V1 safe Beans integration and shared state]]
- [[docs/Private/Tasks/OB-1bvb--v1-core-workspace-and-editing.md|OB-1bvb — V1 core workspace and editing]]
- [[docs/Private/Tasks/OB-lb80--v1-planning-views-and-obsidian-integration.md|OB-lb80 — V1 planning views and Obsidian integration]]
- [[docs/Private/Tasks/OB-anxh--v1-acceptance-and-release-readiness.md|OB-anxh — V1 acceptance and release readiness]]

## Starting development

The first ready leaves are [[docs/Private/Tasks/OB-wzgt--resolve-v1-scope-and-interaction-decisions.md|OB-wzgt — Resolve v1 scope and interaction decisions]] and [[docs/Private/Tasks/OB-hup8--audit-beans-042-contracts-and-complete-the-tui-par.md|OB-hup8 — Audit Beans 0.4.2 contracts and complete the TUI parity matrix]]. Complete their actual decision/contract work; the scaffold may begin after scope decisions, while backend execution waits for both contract evidence and the scaffold. The dependency graph then exposes ready work automatically. After foundations: backend safety → shared state → workspace; feature branches converge at keyboard/parity review; acceptance and performance converge at packaging. Complete epic exit reviews before the milestone.

From the repository root `/home/whisper2shade/Dev/Tools/ObsiBeans`, with the configured Beans CLI available, these read-only commands were verified during planning:

```bash
beans list --json --ready
beans show --json OB-wzgt OB-hup8
```

Read each chosen leaf and its prerequisite handoffs before changing it to in-progress. The ready list is expected to contain those two initial leaves and no containers until their exit gates clear. Build/test commands are intentionally not invented here; the scaffold task establishes them.

## Planning provenance

Planning work: [[docs/Private/Tasks/OB-ik08--prepare-the-v1-implementation-plan.md]]. Earlier guidance/baseline work remains completed: [[docs/Private/Tasks/OB-boi7--correct-project-guidance-and-select-compatibility.md]]. Earlier proposal saving remains a historical work record, not the implementation backlog.
