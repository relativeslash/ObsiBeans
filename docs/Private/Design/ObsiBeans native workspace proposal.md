---
created_at: 2026-10-26T01:16:31Z
updated_at: 2026-10-26T01:46:43Z
---

# ObsiBeans native workspace proposal

> [!important] Accepted v1 design — not implemented
> On 2026-10-26, the project owner accepted this proposal as version 1 and requested an implementation plan. It defines the intended native Obsidian interface for Beans with application lifecycle management (ALM) interaction patterns. Open decisions below still require explicit resolution; acceptance is not evidence of implemented or tested behavior.

Implementation entry point: [[docs/Private/Tasks/OB-fgjv--obsibeans-v1-native-workspace.md|v1 milestone and dependency-ordered implementation plan]]. Work status, sequencing, acceptance checklists and agent handoffs live in Beans, not in this design note.

## Purpose and scope

Audience: the project owner, designers, and plugin implementers. This is the authoritative home of the accepted v1 target design, retaining its original proposal title and rationale. It is intended for Obsidian reading view and private development use; it is not a public product announcement or operating guide.

The requested experience is all Beans TUI functionality inside Obsidian, with the discoverability of issue trackers such as YouTrack and Jira. The recommendation is a native graphical workspace over the same Beans data, not a terminal embedded in a tab and not a separate issue database.

Related project context and selected compatibility targets: [[docs/Private/Contributing/ObsiBeans project info.md]]. Shared-standard inheritance and optional overrides: [[docs/Private/Contributing/README.md]]. Documentation entry point: [[docs/README.md]].

## Evidence and compatibility baseline

Inspected on 2026-10-26:

- The installed CLI's help for `tui`, `graphql`, `list`, and `update`, plus its emitted GraphQL schema and `beans prime` output.
- Go build metadata identifying module `github.com/hmans/beans` at `v0.4.2`. The binary's own version command reports `dev (unknown) built unknown`; this is not a verified release-binary identity.
- Cached v0.4.2 TUI source: key bindings, help, list, detail, creation, and application event handling.
- Repository `.beans.yml`: task directory `docs/Private/Tasks`, prefix `OB-`, four-character random suffix, default status `todo`, default type `task`. These are observed project settings, not plugin-wide constants.

Upstream describes creation, relationship editing, bulk changes, and detail previews in its [release notes](https://github.com/hmans/beans/releases). The [Beans repository](https://github.com/hmans/beans) warns that interfaces may change. Local inspected behavior is the proposal's baseline; upstream main is not assumed compatible.

No plugin implementation, runtime integration test, or complete interactive TUI parity audit has been performed. Before claiming full parity, enumerate and test every action against the exact supported binary, including inherited navigation bindings and modal behavior.

## Product principles

1. Beans remains the source of truth for issue data and validation.
2. Obsidian supplies navigation, Markdown rendering, linked documentation, and link-aware file operations.
3. Common operations have visible controls and keyboard equivalents.
4. The CLI, coding agents, note editor, and plugin operate on the same files without a competing issue database.
5. Interface conveniences do not masquerade as backend capabilities.
6. Failed or conflicting writes remain visible and recoverable.

## Workspace layout

A normal Obsidian workspace tab contains navigation, a work view, and a resizable inspector. The inspector can also open as a dedicated issue tab.

```text
ObsiBeans       Search beans…                       Refresh   + New bean
┌────────────────┬───────────────────────────────┬────────────────────────┐
│ VIEWS          │ All work                      │ Selected bean          │
│ All work       │ List · Board · Hierarchy      │ Title                  │
│ Ready          │                               │ Status ▾ Priority ▾    │
│ In progress    │ Status ▾ Type ▾ Tags ▾        │ Type ▾ Tags            │
│ Blocked        │ Save view                     │                        │
│                ├───────────────────────────────┤ Description            │
│ PLANNING       │ □ ID       Title      Status  │ Markdown and checklist │
│ Milestones     │ □ OB-a7k2  Inspector  Active  │                        │
│ Epics          │ □ OB-b9m3  Filtering  Todo    │ Parent · Children      │
│                │ □ OB-c2p8  Navigation Todo    │ Blocked by · Blocks    │
│ SAVED VIEWS    │                               │ Linked notes           │
│ High priority  │                               │ Open source note       │
└────────────────┴───────────────────────────────┴────────────────────────┘
Connected to Beans                                      Changes saved
```

The records and abbreviated labels above are illustrative, not existing beans. UI labels can be friendly, but stored statuses keep their Beans identifiers.

The left pane contains built-in views and saved filters. The center shows the chosen representation. The right pane follows selection without losing the work view's scroll position. Narrow panes collapse navigation and present details as a full-pane screen with a back action.

### Visual direction

Use Obsidian theme colors, typography, icons, focus styles, and light/dark modes. Combine compact work rows with more generous spacing in descriptions. Use restrained status badges, clearly distinguished selection and focus, visible blocking indicators, and adjustable density. Do not add decorative charts that compete with work navigation.

## Work views

| View | Primary use | Proposed interactions |
| --- | --- | --- |
| List | Search, triage, bulk editing | Configurable columns, sorting, inline fields, checkboxes, inspector |
| Board | Understand workflow | Status columns, cross-status drag, optional parent swimlanes |
| Hierarchy | Plan larger work | Expand parents, inspect children, progress and blockers, create child |

All views share filters and selected bean identity. Parent context shown for a search match is visually distinguished from a matching result and excluded from match counts and implicit bulk selection.

Board columns map to `draft`, `todo`, `in-progress`, `completed`, and `scrapped`. Moving a card between columns updates its status. It does not create a separate workflow. Provide a keyboard-accessible move action as an alternative to drag and drop.

The inspected GraphQL schema does not expose manual order. Cards initially use deterministic sorting; same-column dragging must not imply persisted arbitrary ordering. Revisit if a supported Beans interface provides ordering.

Ready follows the installed CLI's semantics: not blocked, excluding draft, in-progress, completed, and scrapped. Verify this against the backend rather than deriving readiness from the visible column alone.

## TUI parity map

This table is a proposed implementation contract based on inspected source, not evidence of completed parity.

| Existing TUI capability | Proposed native equivalent |
| --- | --- |
| Hierarchical browsing and parent context | Hierarchy view; contextual ancestors in filtered results |
| Highlight-driven preview | Selection-driven inspector |
| Detail view, scrolling, related-bean navigation | Issue tabs, scrollable content, relationship links and back navigation |
| Creation | Quick-create dialog and expanded form |
| Editing in an external editor | In-Obsidian body editor and open-source-note action; optional explicitly configured external editor |
| Status, type, priority changes | Inline pickers and inspector fields |
| Set or remove parent | Searchable eligible-parent picker |
| Blocking relationships | Distinct Blocked by and Blocks sections with add/remove actions |
| Text and tag filtering | Search and tag chips with clear/reset actions |
| Multi-selection and batch status/type/priority/parent changes | Checkboxes, selection count, bulk toolbar, per-bean outcomes |
| Copy current or selected IDs | Copy actions and shortcut |
| Keyboard navigation, help, return and quit | Focus-scoped shortcuts, help overlay, back and close-view actions |
| Responsive list and preview | Collapsible panes preserving essential actions |

Optional familiar bindings: `j/k`, `/`, `c`, `e`, `s`, `t`, `p`, `P`, `b`, `y`, `Space`, and `?`; `g t` opens tag filtering. Space can select and advance. These bindings apply only to the focused Beans view outside text inputs. Escape closes the current popup or clears the relevant selection/filter without discarding an unsaved draft. Closing a Beans view never quits Obsidian.

Every action has a visible control or command-palette equivalent. Bulk actions show the explicit target count, including any hidden selected items, and allow clearing selection. Relationship and body editing remain single-bean actions unless a separately specified bulk workflow is added.

## Issue details and creation

The inspector contains editable title, status, type, priority and tags; Markdown description and checklists; parent breadcrumb; children; blocking relationships; related notes/backlinks; and created/updated timestamps. Offer Open source note, Copy ID, and Copy note link.

Use full bean IDs as stable application identity. Do not interpret random suffixes as sequential issue numbers. Title changes do not automatically rename files. Any explicit file rename preserves the bean ID and goes through Obsidian's link-aware file management.

Create draft explicitly selects draft, preserving the TUI capture workflow. Ordinary creation displays the effective project default status. A new-child action pre-fills parent and validates the chosen type with Beans. Canceling an unsaved form does not create a bean.

Metadata changes use field-level save feedback. Description edits have an explicit Save/Cancel boundary and retain a recoverable draft on failure. A checklist action updates only the intended item with conflict checking; duplicate text must not cause an arbitrary replacement.

## ALM-style additions

These are proposed conveniences beyond the inspected TUI baseline:

- Saved searches and filters, including high-priority bugs and blocked features.
- Milestone/epic progress summaries with explicit counting rules. Show completed and scrapped separately; avoid double-counting intermediate parents as leaf work.
- Quick child creation and shared list/board/hierarchy navigation.
- Convert selected note text into a bean with a source-note link; insert a bean link in the current note.
- Compact ready/in-progress sidebar view.
- Editable tags through the Beans backend, beyond the TUI's tag-filter action.

No native assignees, sprints, estimates, threaded comments, permissions, or audit history are assumed. Those require separate data-model decisions. A milestone view is not a scheduled timeline without a supported date model. Saved views and layout preferences are plugin state, not extra bean frontmatter.

## Architecture proposal

```text
Obsidian views and commands
           ↓
Shared application state and action layer
           ↓
Version-aware Beans adapter
           ↓
Beans CLI / GraphQL
           ↓
Existing .beans.yml and bean Markdown files
```

Use native workspace views, settings, commands, and lifecycle-managed listeners. These extension points exist in the [official Obsidian API](https://github.com/obsidianmd/obsidian-api/blob/master/README.md). A UI framework and dependency versions remain undecided; this proposal does not select a standalone web-app stack.

Discover and explicitly bind the intended project configuration and task root. Never assume `.beans/`, inherit an unrelated working directory, or silently execute a repository-provided binary. The user selects or confirms the executable. Resolve bean paths against the configured root and reject traversal outside it.

Use structured CLI/GraphQL output, variables rather than string-built queries, runtime response validation, and capability checks. Do not require an HTTP server absent from the inspected CLI. The adapter owns child-process timeouts, cancellation, output limits, and error translation. Views consume typed results rather than subprocess output.

The initial supported environment is desktop Obsidian because the design executes a local binary. Mobile needs a separate backend strategy and is not promised. External task directories and multiple repositories also need explicit scope decisions before implementation.

### Data ownership

| Data or operation | Owner |
| --- | --- |
| Issue fields, relationships, validation and supported mutations | Beans |
| Link resolution, Markdown rendering, navigation, explicit moves/renames | Obsidian |
| Saved filters, layout, selected view and preferences | Plugin settings/state |
| Unsaved edits | Recoverable local draft, never reported as backend-saved data |

There is no second authoritative issue database. Caches are disposable. Unsupported frontmatter is a write-safety concern: Beans updates can discard extra fields, so the plugin must detect unsafe cases and block or warn according to a verified preservation policy, not silently promise preservation.

## Reliability and accessibility requirements

- Execute the configured binary with argument arrays, not a shell command assembled from bean content. Never execute text from descriptions or links.
- Use ETags for supported writes. On mismatch, retain the local draft, refresh remote data, and offer review/reconciliation rather than a blind overwrite. Verify actual concurrency guarantees of the supported backend.
- Refresh after CLI, agent, and note-editor changes using debounced vault events and explicit refresh. Ignore stale query responses. Avoid duplicate mutations from repeated clicks.
- Distinguish loading, empty project, no search matches, disconnected backend, invalid data, pending save, failed save, and conflict states. Show a last-refresh indicator when cached data is stale.
- Show individual bulk successes and failures. Do not imply transactionality across beans. Retry only failed items after rechecking their state.
- Validate relationships in the backend; explain rejected cycles, missing targets, or incompatible parent types. Reconcile directional blocking fields before presenting a simplified relationship editor.
- Preserve keyboard focus and scroll positions across refreshes. Support keyboard-only operation, accessible names, visible focus, non-color status indicators, zoom, and reduced motion.
- Release listeners, timers, rendering components, and subprocesses when their owning view/plugin closes.
- Measure large-dataset behavior before choosing performance guarantees. Avoid eager body loading for every row; consider virtualization without breaking keyboard navigation.

Archive and deletion are additional CLI workflows, not baseline TUI parity. They remain outside the initial enabled actions until Beans relationship cleanup, Obsidian link updates, trash behavior, conflict safety, preview, and recovery have one verified design. Never substitute permanent deletion for trash or move files behind Obsidian's back.

## Proposed decision and alternatives

**Decision status:** accepted for v1 by the project owner on 2026-10-26. Use a native graphical workspace with a version-aware CLI adapter. The acceptance does not settle the explicitly open decisions or verify the backend assumptions.

**Alternatives:** an embedded terminal would preserve terminal interaction but not deliver the requested native ALM experience; an embedded web application would depend on a separate compatible runtime and integration model; direct Markdown/YAML mutation would duplicate Beans validation and serialization responsibilities.

**Consequences:** native UI gives better note integration and discoverability, but requires explicit parity tests, backend compatibility handling, and desktop process management. Maintain one action layer so list, board, hierarchy, and shortcuts do not implement divergent business rules.

**Review triggers:** changing the selected compatibility baseline, changes to the Beans schema, ordering support, archive/delete work, mobile requirements, or evidence that a supported upstream web interface better meets the integration requirements.

## Acceptance scenarios for a future implementation

These are intended acceptance criteria, not completed tests or implementation tasks.

1. Create, inspect, edit, filter, and link a bean without leaving Obsidian; confirm the CLI sees the same resulting data.
2. Exercise every supported TUI action and modal workflow using both visible controls and keyboard equivalents.
3. Change status from list, board, and inspector; all views converge on the same persisted result.
4. Reject invalid parents and blocking cycles without corrupting existing relationships.
5. Edit concurrently through an agent or note editor; retain drafts and surface conflicts instead of silently replacing newer data.
6. Fail part of a bulk update and show accurate per-bean outcomes without retrying successful changes.
7. Handle an unavailable executable, malformed data, slow command, narrow pane, and empty project with actionable states.
8. Verify theme compatibility, keyboard-only use, zoom, focus restoration, and representative large datasets.
9. Confirm disabling/reloading the plugin leaves no orphan processes or listeners and does not discard unsaved edits silently.

## Open decisions

Initial compatibility targets are selected in [[docs/Private/Contributing/ObsiBeans project info.md]]; validate them before claiming support. Confirm default creation behavior, initial project scope, external-editor support, saved-view sharing, and data-preservation policy before implementation. Manual ordering, archive/delete, mobile, and additional ALM data fields require separate decisions rather than implicit feature promises.

## Documentation exception and provenance

**Resolved routing misunderstanding, 2026-10-26:** the user clarified that root AGENTS.md contained copied Concordance paths and that local standards notes are optional overrides. The canonical guide is [[docs/Private/Guides/ObsiBeans AI working guide.md]], and a missing or empty local documentation-standards override is not a blocker. Shared standards were present throughout. Current guidance is in [[docs/Private/Contributing/README.md]]; no ongoing exception is required for absent optional override notes.

Historical record: before that clarification, the user approved saving this clearly marked proposal despite the two apparently missing local paths. That save-only approval had been recorded against `DSE-REPO-003` and the Documentation README's missing-required-file stop rule, with available shared standards as mitigation and restoration of guidance or implementation as the review trigger. The routing correction resolved that concern but did not itself accept the architecture. The later, explicit v1 acceptance is recorded at the top of this note.

The app reports this checkout's vault name as `ObsiBeans`, and root AGENTS.md now identifies it correctly. Automation targets that vault rather than the separate Concordance checkout. The correction and version selection are tracked in [[docs/Private/Tasks/OB-boi7--correct-project-guidance-and-select-compatibility.md|project guidance work record]].

Original proposal-save verification and historical next-step suggestions are recorded in [[docs/Private/Tasks/OB-q8iu--save-obsibeans-native-workspace-design-proposal.md|proposal work record]]. Current implementation sequencing is owned by [[docs/Private/Tasks/OB-fgjv--obsibeans-v1-native-workspace.md|the v1 implementation milestone]].
