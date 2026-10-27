---
created_at: 2026-10-26T02:32:50Z
updated_at: 2026-10-27T02:22:00Z
---

# Beans 0.4.2 contract

> [!important] Observed backend contract, not plugin behavior
> This note records how the selected Beans release actually behaves, verified on 2026-10-26 against the official v0.4.2 release binary and its tagged source. It is the input for the ObsiBeans Beans adapter. The process and binding layer (OB-8jei) and the typed reads and mutations (OB-41mc) exist in `src/adapter/`; the shared state (OB-os2h) exists in `src/state/`. The adapter decisions at the end are binding design decisions; a row is implemented only where its Owner column says so below.

Audience: implementers of the Beans adapter, shared state, and relationship editing. The product design is [[docs/Private/Design/ObsiBeans native workspace proposal.md|the accepted v1 design]]. The keyboard and modal parity contract is [[docs/Private/Design/Beans 0.4.2 TUI parity matrix.md|the TUI parity matrix]]. The selected version pair is in [[docs/Private/Contributing/ObsiBeans project info.md|project information]]. The audit work record is [[docs/Private/Tasks/OB-hup8--audit-beans-042-contracts-and-complete-the-tui-par.md|OB-hup8]].

Each fact carries a `BC-*` identifier when an automated assertion in `test/contract/beans-0.4.2/audit.sh` checks it. Facts without an identifier come from reading the tagged source and are cited by file.

## Provenance

| Item | Value |
| --- | --- |
| Release | [v0.4.2](https://github.com/hmans/beans/releases/tag/v0.4.2), published 2026-03-10T20:11:34Z |
| Tagged commit | `670ecf3b0d659fa61f875b45cf1fa5e22b745b30` |
| Audited asset | `beans_Linux_x86_64.tar.gz`, SHA-256 `266d1e4dc7392c38131c4842c60cbd2f14d5e5f7a520bc297a9b9056fda7fcd0`, matching the release's `beans_0.4.2_checksums.txt` |
| Binary | SHA-256 `a96444ff61509fb7a94ca7733e76a96768967fe8efc592d84df35e45e3d94307`, built with Go 1.26.1 |
| Version output | `beans 0.4.2 (670ecf3) built 2026-03-10T20:07:43Z` (BC-01) |

The developer machine's `~/go/bin/beans` is a `go install` build of the same module version. It reports `dev (unknown) built unknown` and was built with a different Go toolchain, so it is not the audited binary. Only the release asset above is evidence for this contract.

**Development builds.** The plugin accepts a build that reports `dev` as its version, because upstream development moves faster than releases and its improvements are wanted. Such a build binds as *unverified*: the settings status says so, and nothing in this note is guaranteed for it. The adapter decisions below are written as safe fallbacks that hold even if upstream fixes a gap, but a dev build that changes a `BC-*` fact is a review trigger. On 2026-10-26 the developer machine's `go install` build had a help output and GraphQL schema identical to the committed snapshots, and passed the real-binary adapter tests. Any other version string, including other releases, is rejected.

Help output for every command and the GraphQL schema are committed as snapshots in `test/contract/beans-0.4.2/snapshots/` (BC-02). Do not hand-edit them.

## Rerunning the audit

Runnable procedure. It needs network access to GitHub, plus `bash`, `curl`, `tar`, `sha256sum`, `jq`, and `python3`. Run it from the repository root:

```bash
test/contract/beans-0.4.2/audit.sh
```

Expected result: one `ok` line per assertion and a final line `PASS: Beans 0.4.2 contract holds`, with exit code 0. Any `FAIL <id>` line names the contract fact that changed, and the exit code is 1. A download or checksum failure stops the run before any assertion.

The script downloads and verifies the release into a temporary directory, builds its own fixture projects there (including a path with spaces), and deletes everything on exit. It does not read or change the repository's own tracker, and it unsets `BEANS_PATH`. It is safe to rerun.

`--update-snapshots` overwrites the committed snapshots with the current output. Use it only when deliberately changing the audited release, and review the resulting diff.

Interactive TUI paths were exercised separately in a detached `tmux` session; the method is in the parity matrix.

## Invocation

- Every command except `init`, `prime`, and `version` loads the whole project at process start. Each invocation reads all bean files and keeps nothing between runs.
- Project discovery searches upward from the working directory for `.beans.yml`. `--config <file>` overrides the search. The task root comes from `beans.path`, relative to the config file. `--beans-path` overrides it, and so does the `BEANS_PATH` environment variable, silently (BC-07). Precedence: flag, then environment, then config (`cmd/root.go`).
- `beans graphql --schema` fails outside an initialized project (BC-03).
- Queries take variables as a JSON string with `-v`, or read the query from standard input.
- Without `--json`, output contains ANSI color codes even when piped and with `NO_COLOR=1` set (BC-06).
- Success: exit code 0 and the GraphQL `data` object on standard output. A missing bean is `null`, not an error (BC-04).
- Failure: exit code 1, empty standard output, and standard error starting `Error: graphql: <message>` followed by the command's usage text (BC-05). The `errors` array, error paths, and partial data are not returned. Messages are plain strings with no error codes.

## Data model

- Statuses, types, and priorities are fixed lists in the binary, not configuration (`internal/config/config.go`):
  - Statuses in sort order: `in-progress`, `todo`, `draft`, `completed`, `scrapped`.
  - Types: `milestone`, `epic`, `bug`, `feature`, `task`.
  - Priorities: `critical`, `high`, `normal`, `low`, `deferred`.
- Configuration keys: `path`, `prefix`, `id_length`, `default_status`, `default_type`, `require_if_match`.
  - Missing `default_status` means `todo`.
  - A config file without `default_type` makes the CLI create milestones (BC-14). With no config file at all, the CLI creates tasks.
- When `prefix` or `id_length` is missing from the config, Beans uses an empty prefix and 4 characters (observed on the 0.4.2 release binary by creating beans in a project without those keys). A missing `path` is not assumed to mean `.beans`: the adapter treats it as an invalid configuration.
- A bean's ID comes from its filename, `<id>--<slug>.md` or `<id>.md`. The `# <id>` comment written into frontmatter is ignored on read.
  - Short IDs without the prefix resolve wherever an ID is accepted (BC-29).
  - IDs are random NanoIDs with no ordering meaning.
- On read, a missing type becomes `task`, a missing priority becomes `normal`, and missing tags become an empty list. These defaults are not written back until the next update.
- `path` is relative to the task root. Beans in subfolders and in `archive/` are loaded like any other (BC-43).
- Every `.md` file anywhere under the task root is loaded as a bean, including ordinary notes. An ordinary note gets its filename as ID and an empty status and title (BC-41).
- Two files with the same ID: one silently shadows the other, and `beans check` does not report it (BC-42, BC-43b).
- One file with malformed frontmatter makes every command fail with `Error: loading beans: loading <path>: parsing front matter: …` (BC-44).
- CRLF files load, but the carriage returns stay in the body text, and the next write produces mixed line endings.
- The body as read has a leading newline and no trailing newline. For example, `X\n` written via `body` reads back as `\nX` (BC-22). A mutation's own answer lacks that leading newline (observed on the 0.4.2 release: `createBean` answered `Hello` and the next read gave `\nHello`), so the adapter reads every bean back after a successful write.

## Queries

- `bean(id)` and `beans(filter)` are the only queries. The filter fields are listed in the schema snapshot.
- Result order of `beans` is unspecified and changes between runs, because results come from Go map iteration. Clients must sort.
- `search` uses Bleve query syntax over slug, title, and body.
  - Results are capped at 1000 (`internal/search/index.go`).
  - Invalid syntax returns an empty list, not an error (BC-40).
- Relationship fields each see only one storage direction (BC-37):
  - `blockingIds` and `blocking` come from this bean's `blocking` frontmatter.
  - `blockedByIds` comes from this bean's `blocked_by` frontmatter.
  - `blockedBy` comes only from other beans' `blocking` lists.
  - So a bean that blocks another through that other bean's `blocked_by` shows an empty `blocking` list.
- `children` lists beans whose `parent` is this bean. `parent` resolves to `null` when the target is missing.
- `isBlocked: true` means at least one blocker in either direction is not `completed` or `scrapped` (BC-38).
- Readiness, as `beans list --ready` defines it, is the filter `{ isBlocked: false, excludeStatus: ["in-progress", "completed", "scrapped", "draft"] }` (BC-39). It ignores the parent's status.
- `isBlocked` and readiness exist only as filters, never as bean fields. A blocker that does not exist does not block (observed on a development build with a `blocked_by` entry naming a missing bean). `listBeans` therefore computes `blockedIds` and `readyIds` from the rows with this rule (`readiness` in `beans-read.ts`), which agrees with both filters on the release binary and on a development build in the real-binary adapter test. They are complete only for an unfiltered list.

## Mutations

| Mutation | Validates | Does not validate |
| --- | --- | --- |
| `createBean` | Parent type and existence, blocker existence | Status, type, priority, tags, title (BC-10, BC-13). Missing status is stored as empty and missing type as `task`; config defaults are not applied (BC-08) |
| `updateBean` | Parent type and cycles, blocking targets and same-type cycles, `body` against `bodyMod`, `tags` against `addTags`/`removeTags` | Status, type, priority, tags; type changes against existing parent or children (BC-30) |
| `setParent` | Parent type, existence, cycles (BC-27, BC-28, BC-31) | |
| `addBlocking`, `addBlockedBy` | Self-reference, target existence, cycles within one link direction (BC-32 to BC-34) | Cycles that mix `blocking` and `blocked_by` edges (BC-35), which `beans check` also misses (BC-36) |
| `removeBlocking`, `removeBlockedBy` | | Whether the link existed; removing an absent link succeeds |
| `deleteBean` | Existence | Rewrites other beans to drop links, then deletes the file. Several files, not atomic. Out of v1 scope |

- The CLI validates status, type, and priority before it calls the same resolvers (BC-11). No path validates tags (BC-12). The documented tag rule is `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` (`internal/bean/bean.go`).
- One mutation field writes one bean file once, after all of that field's validation. A failing field writes nothing; a failed `bodyMod` leaves the body unchanged (BC-24).
- A document with several mutation fields runs them in order. A failure keeps earlier writes but discards all output, so the caller cannot see which fields succeeded (BC-25).
- `bodyMod.replace` needs non-empty text that occurs exactly once. Duplicates fail with `text found N times in body (must be unique)` (BC-23). Including surrounding lines in `old` disambiguates repeated checklist items.
- `addTags` and `removeTags` rebuild the tag list through a Go map, so tag order changes unpredictably. `tags` replaces the list in the given order.
- Changing a title never renames the file or changes the slug (BC-21).
- Writes stamp `updated_at` in UTC with second precision.
- Write errors surface as `writing file: <os error>`, for example `permission denied` (BC-26). Writes use `os.WriteFile`: no temporary file, no rename, no fsync (`internal/beancore/core.go`). An interrupted write can leave a truncated file. That case was not reproduced.

## ETags and concurrency

- A queried `etag` is the FNV-1a 64-bit hash of the bean as Beans would re-render it.
- `ifMatch` is compared with the FNV-1a 64-bit hash of the raw file bytes on disk.
- The two agree only for files in Beans' canonical form (BC-18). A bean written without a priority, created by GraphQL or the CLI without `-p`, is not canonical: its queried ETag is always rejected (BC-15, BC-16). Hashing the raw bytes gives the accepted value (BC-17).
- The mismatch error reveals the current on-disk ETag (`etag mismatch: provided X, current is Y`). Retrying with `Y` bypasses the conflict check.
- All single-bean mutations accept `ifMatch` (BC-19). Without it, the last writer wins, overwriting anything written after that process loaded its data. `require_if_match: true` makes `ifMatch` mandatory.
- The check and the write share an in-process lock only. There is no file lock between processes, so two writers can both pass the check in a narrow window. In a 20-way parallel test with the same ETag, one write succeeded. That observation is not a guarantee.

## Frontmatter, formatting and ordering

Any update rewrites the whole file in canonical form:

- Unknown keys such as `aliases`, YAML comments, and custom key order are dropped (BC-20).
- Known keys appear in a fixed order.
- A `# <id>` comment line is inserted after the opening `---`.

The TUI's external-editor flow also rewrites the file after the editor exits (`internal/tui/tui.go`, `editorFinishedMsg`).

There is no ordering field. The schema has none, and an `order` key is dropped like any unknown key (BC-20). Manual card order is not available in this release.

## Adapter decisions

The table below is the safe fallback for each gap above. It is binding for implementation unless the owner revisits it.

| Gap | Adapter decision | Owner |
| --- | --- | --- |
| Queried ETag can differ from the checked one | Compute `ifMatch` as FNV-1a 64 of the exact file bytes last read, send it with every mutation, and never retry using the ETag from an error message. Treat a mismatch as a conflict. **Implemented** by `mutateBean` (`beans-write.ts`): the caller passes the `revision` it read (the FNV-1a 64 of the file bytes, `beans-guard.ts`); the adapter re-reads the file, returns a `conflict` without starting Beans if the hash differs, and otherwise sends that same value as `ifMatch`. A mismatch Beans reports is a `conflict` too and is never retried. Beans has no `ifMatch` for `createBean`, so creation is unguarded; `createBean` re-lists the task root after a failure and reports the IDs that appeared. | [[docs/Private/Tasks/OB-41mc--implement-validated-beans-reads-and-conflict-safe.md\|OB-41mc]] |
| Updates drop unknown frontmatter and comments | Block mutations on a bean whose frontmatter has keys outside `title, status, type, priority, tags, created_at, updated_at, parent, blocking, blocked_by`, or comments other than the `# <id>` line. Missing defaults, key order, and CRLF are lossless normalization and are allowed. **Implemented** by `unsafeReason` (`beans-guard.ts`), which also refuses a file without a valid status or with an unknown type or priority. A `#` inside a quoted value or inside a word is not a comment. A multi-line quoted scalar can be reported as a comment; that only blocks the bean, never damages it. | OB-41mc |
| No server-side validation of values | Validate status, type, and priority against the fixed lists, tags against the Beans tag pattern, and require a non-empty title before any mutation. **Implemented** in `beans-model.ts` (`checkFields`, `checkTitle`, `checkTags`) and applied by `mutateBean` and `createBean`; titles must also be one line. The input forms remain OB-yieb's. | OB-41mc, [[docs/Private/Tasks/OB-yieb--build-inspector-creation-and-recoverable-descripti.md\|OB-yieb]] |
| GraphQL creation ignores config defaults | Always send explicit status and type. Status defaults to the configured `default_status` (fallback `todo`). Type defaults to the configured `default_type`, or `task` when the key is absent: the CLI's `milestone` fallback is not reproduced. **Implemented** in `createBean`: `Binding.defaults` carries `default_status` and `default_type` (with the `todo` and `task` fallbacks), and priority is sent as `normal`. The creation form that displays them remains OB-yieb's. | OB-yieb |
| Multi-field documents are not atomic and lose output | One mutation field per process invocation; bulk work is a sequence of independent calls. **Implemented**: every `Change` is one mutation field. | OB-41mc, [[docs/Private/Tasks/OB-26rz--build-explicit-target-bulk-editing-with-partial-fa.md\|OB-26rz]] |
| Relationship fields are one-directional | Build the blocking graph from every bean's `blockingIds` and `blockedByIds`. Remove an edge through the field that stores it: `removeBlocking` on the source or `removeBlockedBy` on the target. **Implemented** by `relationsOf` (both directions) and `removalPlan`, `additionOf` (`src/state/relations.ts`): one write when one file stores the link, two when both do, stopping at the first failure. | [[docs/Private/Tasks/OB-op2n--build-parent-children-and-directional-blocker-edit.md\|OB-op2n]] |
| Mixed-direction cycles are accepted | Check the unified graph for cycles before adding a blocker and reject locally. Show existing cycles as invalid data with bounded traversal. **Implemented** for blockers: `localProblem` runs in `WorkspaceState.mutate`, so every caller is checked against the loaded data (an edit made elsewhere in the meantime can still slip through); `inBlockingCycle` flags a loop already stored, and `ancestry` stops at a parent loop. | OB-op2n, [[docs/Private/Tasks/OB-uqrv--build-hierarchy-navigation-and-milestone-progress.md\|OB-uqrv]] |
| Type changes skip parent and child checks | Validate a type change against the current parent and children before sending it. Show existing violations. **Implemented** by `typeBlockers` and `PARENT_TYPES` (`src/state/relations.ts`), checked in `WorkspaceState.mutate`; the table is asserted against all 25 child/parent pairs on the real binary in `test/adapter/beans-adapter-release.test.ts`. The type picker disables the types it rejects and says why. | OB-op2n, OB-yieb |
| Unordered results; unstable TUI sort | Sort client-side by status, priority, type, case-insensitive title, then full ID. | [[docs/Private/Tasks/OB-7a9z--build-the-searchable-list-and-shared-filtering-con.md\|OB-7a9z]] |
| `addTags` reorders tags | Edit tags with full `tags` replacement in the user's order. | OB-yieb |
| Bleve syntax errors return nothing | Escape user text as a plain-text query. Zero results mean no matches, never an error. | OB-7a9z |
| Any Markdown file is a bean; one bad file breaks all reads | Show a file with an empty status, or an ID that does not match the configured prefix and length, as invalid data and allow no mutations on it. Report a load failure as a project-level invalid-data state naming the file from the error. **Implemented in part:** `scanTaskRoot` in `src/adapter/task-root.ts` lists the task root without reading or following anything and reports names that are not bean IDs, symbolic links and unreadable folders as invalid; the empty-status check is in the reads (`bad-value`), and the load-failure state is **implemented** in the shared state: a `loading beans:` failure with nothing cached is the `invalid-data` status, any other failure is `disconnected`, and with cached beans the list stays visible as stale. | [[docs/Private/Tasks/OB-8jei--implement-trusted-project-binding-and-bounded-proc.md\|OB-8jei]], [[docs/Private/Tasks/OB-os2h--implement-shared-query-state-refresh-and-recoverab.md\|OB-os2h]] |
| Duplicate IDs are silently shadowed | Detect duplicate IDs from the task-root file list and block mutations on them. **Implemented**: `indexTaskRoot` finds them; reads mark the beans with the `duplicate-id` problem and `mutateBean` refuses them. | OB-41mc |
| Environment and working directory change the target | Run the bound executable with `--config <bound .beans.yml>`, the config directory as working directory, `BEANS_PATH` removed from the environment, and `--json` on every call. **Implemented** by `runBeans` in `src/adapter/binding.ts`; `--json` is placed straight after the command name, and `beans version` is probed without it because that command has no such flag. | OB-8jei |
| Errors are unstructured strings | Classify by message prefix: `etag mismatch` and `if-match etag is required` are conflicts; `would create cycle`, `cannot have a parent`, `can only have` and `not found` are validation; `replacement N failed` is a body conflict; `loading beans:` is invalid data; `writing file:` is a write failure. Anything else is a generic failure. **Implemented** by `classifyMessage` (`beans-graphql.ts`). `loading beans:` and `writing file:` are tested before the `not found` fragment, because a load error can contain it. | OB-41mc |
| No cross-process lock; non-atomic writes | After a failed, timed-out, or cancelled write, re-read before reporting the outcome. Treat the result as uncertain until the re-read confirms it. Retry a read that fails to parse once after the refresh debounce. **Implemented for writes** by `mutateBean` and `createBean`: after a failure that may have written, the file's bytes are compared with the revision read; unchanged bytes give the plain failure, anything else gives `uncertain` with the re-read bean. **Implemented for reads** by the shared state's loader (`src/state/loader.ts`): a load that fails with `loading beans:` is retried once after the refresh debounce; a second failure stands until the next change. | OB-41mc, OB-os2h |
| Body read-back is normalized | Compare bodies after removing one leading and one trailing newline. | OB-yieb |
| `deleteBean` and `beans archive` exist | Not exposed in v1. | None |

## Review triggers

Rerun the audit and revise this note when the selected Beans release changes, when upstream fixes ETag canonicalization, frontmatter preservation, or relationship validation, or when an implementation finds behavior that contradicts a `BC-*` fact.
