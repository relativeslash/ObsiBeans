---
created_at: 2026-10-26T01:16:31Z
updated_at: 2026-10-26T02:32:50Z
---

# ObsiBeans native workspace proposal

> [!important] Accepted v1 design — not implemented
> On 2026-10-26, the project owner accepted this proposal as version 1 and requested an implementation plan. It defines the intended native Obsidian interface for Beans with application lifecycle management (ALM) interaction patterns. The former open decisions are resolved in [[#V1 decisions]]; acceptance is not evidence of implemented or tested behavior.

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

The audit of the official v0.4.2 release binary superseded this inspection on 2026-10-26. Its results are in [[docs/Private/Design/Beans 0.4.2 contract.md|the Beans 0.4.2 contract]] and [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|the TUI parity matrix]]. No plugin implementation or runtime integration test exists yet.

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
| Board | Understand workflow | Status columns, cross-status drag, parent swimlanes |
| Hierarchy | Plan larger work | Expand parents, inspect children, progress and blockers, create child |

All views share filters and selected bean identity. Parent context shown for a search match is visually distinguished from a matching result and excluded from match counts and implicit bulk selection.

Board columns map to `draft`, `todo`, `in-progress`, `completed`, and `scrapped`. Moving a card between columns updates its status. It does not create a separate workflow. Provide a keyboard-accessible move action as an alternative to drag and drop.

The inspected GraphQL schema does not expose manual order. Cards initially use deterministic sorting; same-column dragging must not imply persisted arbitrary ordering. Revisit if a supported Beans interface provides ordering.

Ready follows the installed CLI's semantics: not blocked, excluding draft, in-progress, completed, and scrapped. Verify this against the backend rather than deriving readiness from the visible column alone.

## TUI parity map

This table summarizes the parity scope. The row-level contract, with stable identifiers, owners, and test types, is [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|the TUI parity matrix]]. Neither is evidence of completed parity.

| Existing TUI capability | Proposed native equivalent |
| --- | --- |
| Hierarchical browsing and parent context | Hierarchy view; contextual ancestors in filtered results |
| Highlight-driven preview | Selection-driven inspector |
| Detail view, scrolling, related-bean navigation | Issue tabs, scrollable content, relationship links and back navigation |
| Creation | Quick-create dialog and expanded form |
| Editing in an external editor | In-Obsidian body editor and open-source-note action; no external editor in v1 |
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

Use native workspace views, settings, commands, and lifecycle-managed listeners. These extension points exist in the [official Obsidian API](https://github.com/obsidianmd/obsidian-api/blob/master/README.md). The UI approach and layer dependency rules are in [[#V1 decisions]]; dependency versions belong in project information. No standalone web-app stack is used.

Discover and explicitly bind the intended project configuration and task root. Never assume `.beans/`, inherit an unrelated working directory, or silently execute a repository-provided binary. The user selects or confirms the executable. Resolve bean paths against the configured root and reject traversal outside it.

Use structured CLI/GraphQL output, variables rather than string-built queries, runtime response validation, and capability checks. Do not require an HTTP server absent from the inspected CLI. The adapter owns child-process timeouts, cancellation, output limits, and error translation. Views consume typed results rather than subprocess output.

The initial supported environment is desktop Obsidian because the design executes a local binary. Mobile needs a separate backend strategy and is not promised. V1 binds one project whose task root is inside the vault; see [[#V1 decisions]].

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

**Decision status:** accepted for v1 by the project owner on 2026-10-26. Use a native graphical workspace with a version-aware CLI adapter. The open decisions were resolved separately in [[#V1 decisions]]; neither verifies the backend assumptions.

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

## V1 decisions

Resolved by the project owner on 2026-10-26 in [[docs/Private/Tasks/OB-wzgt--resolve-v1-scope-and-interaction-decisions.md|the scope decision task]]. These replace the former open decisions list. They are product decisions, not evidence of implemented or tested behavior. Exact runtime and toolchain pins belong in [[docs/Private/Contributing/ObsiBeans project info.md]], not here.

### Scope choices

| Decision | Accepted answer | Rationale | Review trigger |
| --- | --- | --- | --- |
| Repository and task root | One explicitly bound Beans project per vault. Its configured task root must resolve inside the active vault. | Obsidian link resolution, backlinks, and link-aware moves work only on vault files. | A request for external roots or several projects per vault |
| External editor | Not in v1. Use the in-Obsidian body editor and Open source note. | Avoids executing a second user-configured program and its process lifecycle. | Parity testing shows a TUI workflow that cannot be covered in Obsidian |
| Saved-view sharing | Plugin-local only, stored in the plugin's data. Never stored in the repository or bean frontmatter. | No new repository file format or merge conflicts. | A request to share views between clones |
| Creation defaults | Normal creation shows and uses the project's effective default status. A separate Create draft action forces `draft`. | Matches Beans defaults and keeps the TUI capture workflow. | Beans changes its default-status semantics |
| Custom frontmatter | Mutations on a bean with frontmatter that Beans would not preserve are blocked. The plugin explains why and offers Open source note. | Beans can drop extra fields on update. Blocking is the only policy with no data loss before preservation is verified. | Contract evidence from [[docs/Private/Tasks/OB-hup8--audit-beans-042-contracts-and-complete-the-tui-par.md\|the contract audit]] proves preservation, or a baseline change |
| Board parent swimlanes | Included in v1. See [[#Board swimlanes]]. | The owner selected it. | Feedback that lanes add more noise than value |
| UI approach | Svelte 5 components mounted inside Obsidian `ItemView`s, with Obsidian theme variables. No standalone web-app stack. | Keyed reconciliation preserves focus and scroll across refreshes with a small compiled runtime. Obsidian documents this integration. | Svelte compatibility problems with the selected Obsidian baseline |
| Desktop OS test scope | Linux is tested. Windows and macOS are untested, but code must not depend on Linux-only paths, shells, or path separators. | The owner's environment is Linux. Cross-platform claims need evidence. | A request for Windows or macOS support |

Archive and deletion, manual ordering, mobile, and assignees, sprints, estimates, comments, permissions, and audit history remain out of v1. Each requires its own decision.

### Saved views

A saved view stores these fields:

| Field | Meaning |
| --- | --- |
| `id` | Random plugin-generated identifier. Not shown to the user. |
| `name` | User-visible name. Unique among saved views. |
| `search` | Free-text query. Empty means no text filter. |
| `statuses`, `types`, `priorities` | Allowed values. An empty list means any value. |
| `tags` | A bean matches if it has any listed tag. An empty list means any. |
| `readiness` | `any`, `ready`, or `blocked`, using backend semantics. |
| `representation` | `list`, `board`, or `hierarchy` |
| `sort` | Field and direction for list and board order |
| `swimlanes` | Board grouping: `none` or `parent` |

Plugin data carries a `schemaVersion` integer. On load, the plugin migrates older versions one step at a time. A view that cannot be parsed or migrated is kept as raw data, listed as invalid, and can be deleted, but it never blocks loading of other views. A stored filter value that the backend no longer reports, such as a removed status, is retained and shown as unmatched rather than silently dropped. Saved-view problems never touch bean files.

### Progress counting

- Count only leaf descendants: beans under the parent, at any depth, that have no children. Intermediate parents and the parent itself are not counted.
- Show completed and scrapped counts separately.
- Progress percentage is completed divided by the number of leaves that are not scrapped.
- A parent with no leaves shows "No child work" instead of 0 % or 100 %. A parent whose leaves are all scrapped shows "All scrapped".
- Traversal is bounded. It stops at cycles and missing parents and reports them, never looping.

### Selection hidden by filters

Selected beans stay selected when a filter hides them. The bulk toolbar shows the total and hidden counts, for example "5 selected (2 hidden)". Bulk actions target every selected bean, and selection can be reviewed and cleared. After a refresh, beans that no longer exist in the backend leave the selection with a notice. Parent context rows and swimlane headers can never be selected implicitly.

### Draft recovery

Unsaved description edits and unsaved creation forms are recoverable drafts stored in plugin state. They are separate from preferences and never reported as saved data. Each draft records the full bean ID (or a local key for a new bean), the text, the ETag it was based on, and the time. When the bean is reopened, the user can choose Restore or Discard. If the bean's ETag changed after the draft was made, Restore opens conflict review instead of overwriting newer data. A successful save or an explicit discard removes the draft. Drafts for beans that no longer exist stay listed so their text can be copied before discarding.

### Board swimlanes

Swimlanes are a per-view board option. With swimlanes set to `parent`, the board groups cards into one row per direct parent, plus a "No parent" lane. Lanes use the same deterministic order as the list. A lane header is context, not a selectable bean or bulk target. Dragging a card between columns changes its status. Dragging between lanes is not allowed in v1, and a parent change goes through the parent picker. This keeps drag from acting as a hidden relationship edit.

### Module boundaries

The architecture layers above become these dependency rules. The scaffold chooses exact paths and enforces the rules with architecture checks.

| Layer | Owns | May depend on |
| --- | --- | --- |
| Beans adapter | Process execution, CLI and GraphQL calls, response validation, error translation | Node built-ins only. No Obsidian, no Svelte. |
| Application state and actions | Queries, cache, filters, selection, drafts, mutations, conflict state | Adapter interfaces. Obsidian access goes through injected ports for vault events and persistence. |
| Views | Svelte components and their `ItemView` hosts | State and actions. Never the adapter directly. |
| Plugin shell | Plugin class, settings tab, commands, view registration, vault event wiring, link-aware file actions | All of the above |

### Backlog mapping

| Capability | Owner bean |
| --- | --- |
| Beans contract evidence and parity matrix | [[docs/Private/Tasks/OB-hup8--audit-beans-042-contracts-and-complete-the-tui-par.md\|OB-hup8]] |
| Plugin scaffold, toolchain and quality gates | [[docs/Private/Tasks/OB-f6ce--scaffold-the-desktop-plugin-and-executable-quality.md\|OB-f6ce]] |
| Project binding, in-vault task root, executable selection, bounded processes | [[docs/Private/Tasks/OB-8jei--implement-trusted-project-binding-and-bounded-proc.md\|OB-8jei]] |
| Validated reads, ETag mutations, custom-frontmatter blocking | [[docs/Private/Tasks/OB-41mc--implement-validated-beans-reads-and-conflict-safe.md\|OB-41mc]] |
| Shared state, refresh, hidden selection, draft recovery | [[docs/Private/Tasks/OB-os2h--implement-shared-query-state-refresh-and-recoverab.md\|OB-os2h]] |
| Workspace layout and issue tabs | [[docs/Private/Tasks/OB-s9b7--build-native-workspace-navigation-and-issue-tab-li.md\|OB-s9b7]] |
| List, search, filters and tag chips | [[docs/Private/Tasks/OB-7a9z--build-the-searchable-list-and-shared-filtering-con.md\|OB-7a9z]] |
| Inspector, creation defaults, body editing, editable tags, copy ID and link | [[docs/Private/Tasks/OB-yieb--build-inspector-creation-and-recoverable-descripti.md\|OB-yieb]] |
| Parent, children and blockers | [[docs/Private/Tasks/OB-op2n--build-parent-children-and-directional-blocker-edit.md\|OB-op2n]] |
| Bulk editing and copying selected IDs | [[docs/Private/Tasks/OB-26rz--build-explicit-target-bulk-editing-with-partial-fa.md\|OB-26rz]] |
| Status board and parent swimlanes | [[docs/Private/Tasks/OB-q9nz--build-the-status-board-with-accessible-card-moveme.md\|OB-q9nz]] |
| Hierarchy and progress counting | [[docs/Private/Tasks/OB-uqrv--build-hierarchy-navigation-and-milestone-progress.md\|OB-uqrv]] |
| Note links, backlinks, selected-text conversion, link insertion | [[docs/Private/Tasks/OB-rmmo--build-note-links-backlinks-and-selected-text-conve.md\|OB-rmmo]] |
| Saved views, schema migration, ready and in-progress sidebar | [[docs/Private/Tasks/OB-cjoc--build-saved-views-and-ready-work-sidebar.md\|OB-cjoc]] |
| Keyboard parity, help overlay, responsive layout | [[docs/Private/Tasks/OB-363m--complete-accessible-keyboard-parity-and-responsive.md\|OB-363m]] |
| Large-project performance and lifecycle bounds | [[docs/Private/Tasks/OB-t0ve--measure-large-project-behavior-and-lifecycle-resou.md\|OB-t0ve]] |
| Baseline compatibility, parity and failure verification | [[docs/Private/Tasks/OB-zdg2--verify-baseline-compatibility-parity-and-failure-r.md\|OB-zdg2]] |
| Packaging and handoff | [[docs/Private/Tasks/OB-piqb--package-the-v1-candidate-and-complete-the-agent-ha.md\|OB-piqb]] |

Not in v1 and owned by no bean: external editor, external task roots, multiple projects, shared saved views, manual ordering, archive and delete, mobile, and the additional ALM data fields.

## Documentation exception and provenance

**Resolved routing misunderstanding, 2026-10-26:** the user clarified that root AGENTS.md contained copied Concordance paths and that local standards notes are optional overrides. The canonical guide is [[docs/Private/Guides/ObsiBeans AI working guide.md]], and a missing or empty local documentation-standards override is not a blocker. Shared standards were present throughout. Current guidance is in [[docs/Private/Contributing/README.md]]; no ongoing exception is required for absent optional override notes.

Historical record: before that clarification, the user approved saving this clearly marked proposal despite the two apparently missing local paths. That save-only approval had been recorded against `DSE-REPO-003` and the Documentation README's missing-required-file stop rule, with available shared standards as mitigation and restoration of guidance or implementation as the review trigger. The routing correction resolved that concern but did not itself accept the architecture. The later, explicit v1 acceptance is recorded at the top of this note.

The app reports this checkout's vault name as `ObsiBeans`, and root AGENTS.md now identifies it correctly. Automation targets that vault rather than the separate Concordance checkout. The correction and version selection are tracked in [[docs/Private/Tasks/OB-boi7--correct-project-guidance-and-select-compatibility.md|project guidance work record]].

Original proposal-save verification and historical next-step suggestions are recorded in [[docs/Private/Tasks/OB-q8iu--save-obsibeans-native-workspace-design-proposal.md|proposal work record]]. Current implementation sequencing is owned by [[docs/Private/Tasks/OB-fgjv--obsibeans-v1-native-workspace.md|the v1 implementation milestone]].
