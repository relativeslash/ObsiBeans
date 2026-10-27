---
created_at: 2026-10-26T02:32:50Z
updated_at: 2026-10-27T19:59:38Z
---

# Beans 0.4.2 TUI parity matrix

> [!important] Parity contract, not completed parity
> Each row records what the Beans 0.4.2 TUI does and what ObsiBeans must offer instead. Nothing here is implemented yet. A row is satisfied only when its owner bean's tests pass and the final baseline check in [[docs/Private/Tasks/OB-zdg2--verify-baseline-compatibility-parity-and-failure-r.md|OB-zdg2]] confirms it.

Audience: implementers of the workspace views and the reviewer of keyboard parity. The backend facts referenced here (`BC-*`) are in [[docs/Private/Design/Beans 0.4.2 contract.md|the Beans 0.4.2 contract]]. Product decisions are in [[docs/Private/Design/ObsiBeans native workspace proposal.md#V1 decisions|V1 decisions]].

## Method

Two sources, both from 2026-10-26:

- Source reading of `internal/tui/` at tag v0.4.2 (commit `670ecf3`), plus the key map of the pinned `bubbles` list component (`v0.21.1-0.20250623103423-23b8fd6302d7`). The TUI forwards unhandled keys to that component.
- Interactive runs of the verified release binary in a detached `tmux` session, at 150×30 and 150×32 characters, in a disposable fixture project. Keys were sent with `tmux send-keys`, and screens were read with `tmux capture-pane`. `EDITOR` and `VISUAL` were set to `true`, so the editor returned immediately.

Rows marked **observed** were confirmed interactively. The others rest on the cited source.

Test types:

- **Unit:** state and action layer, no Obsidian.
- **Contract:** adapter against the release binary in a temporary project.
- **Integration:** plugin code with Obsidian APIs, run headlessly where possible.
- **Native window:** a manual or automated check in Obsidian 1.14.5.

## Matrix

| ID | Beans 0.4.2 TUI behavior | ObsiBeans expected result | Owner | Test type |
| --- | --- | --- | --- | --- |
| TP-01 | List shows beans as a parent tree. Ancestors of matches appear dimmed as context. Sort is status, priority, type, title, with no ID tiebreak, so the sort is unstable. **Observed.** | List with parent context that is visually distinct and excluded from counts and selection; deterministic sort ending with full ID | [[docs/Private/Tasks/OB-7a9z--build-the-searchable-list-and-shared-filtering-con.md\|OB-7a9z]] | Unit, native window |
| TP-02 | `↑`/`k`, `↓`/`j` move the cursor. **Observed.** | Arrow keys move selection in the focused list; `j`/`k` as optional bindings | [[docs/Private/Tasks/OB-363m--complete-accessible-keyboard-parity-and-responsive.md\|OB-363m]] | Native window |
| TP-03 | Paging is inherited from the list component: `←` `h` `pgup` `u` and `b` page back; `→` `l` `pgdown` `f` `d` page forward. `b` pages only when no bean is under the cursor, otherwise it opens blocking. | Page Up and Page Down scroll the list. Letter paging keys are intentionally not reproduced because they collide with action keys. | OB-363m | Native window |
| TP-04 | `home` and `end`/`G` jump to the first and last row. `g` alone is swallowed as a chord prefix, so the component's `g` jump is unavailable. | Home and End jump to the first and last row | OB-363m | Native window |
| TP-05 | At 120 columns or wider, a preview pane follows the cursor. Narrower terminals show the list only. **Observed.** | The inspector follows selection; narrow panes collapse to list plus full-pane details with Back | [[docs/Private/Tasks/OB-s9b7--build-native-workspace-navigation-and-issue-tab-li.md\|OB-s9b7]] | Integration, native window |
| TP-06 | `/` opens a fuzzy filter on title and ID inside the list component. This is not Bleve search. `enter`, `tab`, `↑`, `↓` accept; `esc` cancels. **Observed.** | `/` focuses the search field. Search is plain text (see the contract's adapter decisions), and clearing is visible and keyboard reachable. | OB-7a9z | Unit, native window |
| TP-07 | `g` then `t` opens a tag picker listing each tag with its count. Choosing one tag filters the list and shows `[tag: <tag>]` in the header, with ancestors as context. Nothing happens when no tags exist. **Observed.** | Tag chips with any-of matching, a visible active-filter state, and clear/reset; `g t` as an optional binding | OB-7a9z | Unit, native window |
| TP-08 | `esc` or `backspace` on the list clears the selection first, then the tag filter, then the text filter. With nothing left to clear, `esc` quits the TUI. **Observed.** | Escape clears in the same order but never closes the view. Closing is a separate explicit action. | OB-363m | Native window |
| TP-09 | `q` quits from the list (unless filtering), from detail, and from every picker, even while typing in a picker's filter. `ctrl+c` quits anywhere. **Observed:** typing `q` into the status picker filter quits. | Close-view command and button. Letter keys typed into any text input never trigger actions. Closing a Beans view never quits Obsidian. | OB-363m, OB-s9b7 | Native window |
| TP-10 | `?` opens a shortcut overlay from the list or detail; `?` or `esc` closes it. **Observed.** | Help overlay for the focused Beans view, plus a command-palette entry for every action | OB-363m | Native window |
| TP-11 | `enter` opens a full-screen detail view: title, ID, status and tags; a Linked Beans list (Parent, Child, Blocks, Blocked by); and the Markdown body. Blocked by lists only other beans' `blocking` entries, and Blocks omits links stored in other beans' `blocked_by` (BC-37). **Observed:** a task blocking another via `blocked_by` showed no Blocks row. | Issue tab and inspector with separate Blocked by and Blocks sections, built from both storage directions | OB-s9b7, [[docs/Private/Tasks/OB-op2n--build-parent-children-and-directional-blocker-edit.md\|OB-op2n]] | Unit, native window |
| TP-12 | In detail, `tab` toggles focus between links and body. `j`/`k` scroll the focused part. `enter` on a link opens that bean and pushes history; `esc`/`backspace` pops history, then returns to the list. **Observed.** | Relationship links open the related bean; Back returns along the visited path while preserving list scroll and selection | OB-s9b7 | Integration, native window |
| TP-13 | The detail link list supports the `/` fuzzy filter. | No per-section filter. Relationship sections stay short and global search covers lookup. Intentional difference, confirmed at keyboard review. | OB-363m | Native window |
| TP-14 | `p`, `s`, `t`, `P`, `b`, `e`, `y` in detail act on the shown bean, as in the list. | Inspector fields and actions for the shown bean with the same shortcuts | [[docs/Private/Tasks/OB-yieb--build-inspector-creation-and-recoverable-descripti.md\|OB-yieb]] | Native window |
| TP-15 | `s` opens a status picker with the current value marked; `enter` applies, and `esc` or `backspace` cancels. Writes send no ETag, and failures are silently ignored. **Observed.** | Status picker with ETag-protected writes and visible pending, failed, and conflict states | OB-yieb | Unit, contract, native window |
| TP-16 | `t` opens a type picker, same behavior as TP-15. Type changes skip parent and child validation (BC-30). | Type picker that rejects changes invalid for the current parent or children, with an explanation | OB-yieb, OB-op2n | Unit, contract |
| TP-17 | `P` opens a priority picker, same behavior as TP-15. **Observed.** | Priority picker with the TP-15 guarantees | OB-yieb | Unit, native window |
| TP-18 | `p` opens a parent picker: "(No Parent)" first, then beans of a type valid for every selected bean, excluding the selection and its descendants, sorted by type then title, with the current parent highlighted. If any selected bean is a milestone, `p` silently does nothing. **Observed.** | Searchable eligible-parent picker with a clear-parent option. When a milestone is involved, the action is disabled and says why. | OB-op2n | Unit, native window |
| TP-19 | `b` opens a blocking picker for the bean under the cursor: every other bean, with `space` to toggle, `enter` to apply the difference, and `esc` to cancel. It edits only the `blocking` field; failures, including rejected cycles, are ignored. **Observed.** | Add and remove actions in both Blocks and Blocked by, with backend and unified-graph cycle checks, and per-change errors | OB-op2n | Unit, contract, native window |
| TP-20 | `c` opens a one-line title prompt (200 characters). `enter` creates a `draft` bean, with type left to the GraphQL default `task`, then opens the external editor. An empty title or `esc` creates nothing. **Observed.** | Create draft forces `draft` and keeps the quick-capture flow. Normal creation uses project defaults. **External-editor substitution:** the new bean opens in the in-Obsidian inspector instead of an external editor. | OB-yieb | Unit, contract, native window |
| TP-21 | `e` opens the bean file in `$VISUAL`, `$EDITOR`, `vi`, or `nano`. After the editor exits with a changed file, the TUI reloads and rewrites the file, which drops unknown frontmatter (BC-20). | **External-editor substitution:** an in-Obsidian body editor with Save and Cancel, plus Open source note. No external editor in v1. | OB-yieb | Integration, native window |
| TP-22 | `y` copies the current ID or, with a selection, all selected IDs joined by `, `. The footer confirms. **Observed.** | Copy ID for one bean and for the selection, with confirmation | OB-yieb, [[docs/Private/Tasks/OB-26rz--build-explicit-target-bulk-editing-with-partial-fa.md\|OB-26rz]] | Integration |
| TP-23 | `space` marks a bean and moves down. The footer shows `(N selected)` and the bulk keys. Marks survive filter changes, but hidden marks are not counted separately. **Observed.** | Checkboxes and a selection count that includes hidden beans, as in [[docs/Private/Design/ObsiBeans native workspace proposal.md#Selection hidden by filters\|Selection hidden by filters]] | OB-26rz, OB-os2h | Unit, native window |
| TP-24 | With a selection, `s`, `t`, `P`, `p` apply to every marked bean in turn. Failures are skipped silently and the selection is cleared afterwards. **Observed** for `P`. | Per-bean outcomes; only failed items can be retried, after re-reading their state. The selection stays until the user clears it. | OB-26rz | Unit, contract, native window |
| TP-25 | `b`, `e`, and `enter` act only on the bean under the cursor, even with a selection. | Relationship and body editing remain single-bean actions | OB-26rz, OB-op2n | Unit |
| TP-26 | A file watcher reloads the list after changes on disk. An open detail view reloads, or returns to the list if its bean was deleted. | Debounced vault-event refresh plus an explicit Refresh action; a deleted bean shows that it no longer exists | OB-os2h | Integration |
| TP-27 | Columns adapt to width, and the preview disappears below 120 columns. | Responsive panes that keep all essential actions | OB-363m | Native window |
| TP-28 | A load error replaces the list. Mutation errors are not shown; the code marks this as a TODO. | Distinct loading, empty, no-match, disconnected, invalid-data, pending, failed, and conflict states | OB-os2h | Unit, native window |

## Keyboard review (OB-363m)

Results of the keyboard and responsive review of rows TP-02 to TP-04, TP-08 to TP-10, TP-13 and TP-27, run on the implementation in the epic clone. Final confirmation of every row remains with [[docs/Private/Tasks/OB-zdg2--verify-baseline-compatibility-parity-and-failure-r.md|OB-zdg2]].

| Row | Result |
| --- | --- |
| TP-02 | Arrow keys and `j`/`k` move focus along the rows in list, board and hierarchy. |
| TP-03 | Page Up and Page Down move by the rows that fit the list. Letter paging keys (`h` `l` `u` `f` `d` `b`) are not bound. **Intentional difference, confirmed.** |
| TP-04 | Home and End jump to the first and last row. `G` and the `g` chord's jump are not bound; `g t` stays the tag filter. |
| TP-08 | Escape clears the selection, then the tag filter, then the search text, and then does nothing. Backspace is not bound. The creation form leaves on Escape and keeps its draft; the inspector's Escape goes back along the visited path and yields to text fields and pickers. |
| TP-09 | No letter key acts inside a text field or select. Closing is the Close button and the `Close Beans view` command, which detach only the Beans tab; `q` and `ctrl+c` are not bound. |
| TP-10 | `?`, the Help button and the `Show Beans keyboard help` command open a dialog generated from the key tables; Escape or `?` closes it and focus returns. Every action is a palette command (`action-<id>`) while a supporting Beans view is active. |
| TP-13 | No per-section filter in the relationship lists. **Intentional difference, confirmed:** the sections stay short and the workspace search covers lookup. |
| TP-27 | Below 760 px the panes stack. The toolbar wraps, Views and Back keep focus, a pane that opens takes focus, and scroll and the focused row survive. At 200% zoom the pane stacks too and scrolls as a whole instead of letting the controls cover the list. |

Evidence: `test/views/keyboard.test.ts`, the narrow-pane cases in `test/views/workspace-view.test.ts`, the command registration in `test/plugin/main.test.ts` and the keyboard, narrow and zoom checks in `test/native/smoke.ts`.

## Outside TUI parity

The CLI commands `archive`, `delete`, `check`, `init`, `prime`, and `roadmap` are not TUI features and are outside the parity baseline. Archive and delete stay disabled in v1, as the design states.
