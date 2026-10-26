import type { AdapterError, BeanDetail, BeanSummary, Outcome } from '../adapter/beans-model.ts';
import type { ProjectRead } from '../adapter/beans-read.ts';
import type { Change, NewBean } from '../adapter/beans-write.ts';
import type { InvalidTaskFile } from '../adapter/task-root.ts';

/** Re-exported so views can describe failures without importing the adapter. */
export type { AdapterError };

/** What the state layer needs from the Beans adapter. The plugin shell builds it from the adapter and the bound project. */
export interface BeansPort {
  /** Lists the whole project. Must settle (not reject) and stop early when `signal` aborts. */
  list(signal: AbortSignal): Promise<Outcome<ProjectRead>>;
  mutate(id: string, revision: string, change: Change): Promise<Outcome<BeanDetail>>;
  create(bean: NewBean): Promise<Outcome<BeanDetail>>;
}

/** Fixed value lists in their sort order, injected because state may import adapter types only. */
export interface Vocabulary {
  readonly statuses: readonly string[];
  readonly types: readonly string[];
  readonly priorities: readonly string[];
}

/** The filter fields shared by every representation. Empty lists and an empty search mean "any". */
export interface Filters {
  readonly search: string;
  readonly statuses: readonly string[];
  readonly types: readonly string[];
  readonly priorities: readonly string[];
  /** A bean matches when it has any listed tag. */
  readonly tags: readonly string[];
  readonly readiness: 'any' | 'ready' | 'blocked';
}

export const DEFAULT_FILTERS: Filters = { search: '', statuses: [], types: [], priorities: [], tags: [], readiness: 'any' };

/** The two kinds of unsaved text the design recovers. */
export type DraftKind = 'description' | 'creation';

/** Unsaved text. Never backend data. `key` is a full bean ID for a description, or a local key for a new bean. */
export interface Draft {
  readonly kind: DraftKind;
  readonly key: string;
  readonly text: string;
  /** The revision of the bean when editing began; null for a new bean. Beans' own ETag is not used (contract). */
  readonly revision: string | null;
  /** UTC, ISO 8601. */
  readonly savedAt: string;
}

/**
 * How a draft relates to the project as last loaded. `unchecked` means no data yet; `orphaned` means its bean no
 * longer exists, so the text stays listed to be copied; `changed` means restoring needs conflict review.
 */
export type DraftStatus = 'current' | 'changed' | 'orphaned' | 'unchecked';

export interface DraftEntry {
  readonly draft: Draft;
  readonly status: DraftStatus;
}

/** Outcome of choosing Restore on a draft. */
export type Restoration =
  | { readonly kind: 'restore'; readonly draft: Draft }
  | { readonly kind: 'conflict'; readonly draft: Draft; readonly current: BeanSummary }
  | { readonly kind: 'orphaned'; readonly draft: Draft }
  | { readonly kind: 'unavailable' };

/** Per bean ID (or `new:<key>` for a creation). Absent means saved or untouched. */
export type SaveState =
  /** Intended, not yet confirmed. The cached bean is unchanged until Beans confirms. */
  | { readonly kind: 'pending'; readonly intent: Change | NewBean }
  | { readonly kind: 'failed'; readonly error: AdapterError }
  /** Someone else changed the bean. `error.current` is what is there now. */
  | { readonly kind: 'conflict'; readonly error: Extract<AdapterError, { kind: 'conflict' }> }
  /** The write may have been applied. Blocks further writes to this key until dismissed. */
  | { readonly kind: 'uncertain'; readonly error: Extract<AdapterError, { kind: 'uncertain' }> };

export type MutationResult =
  | { readonly kind: 'saved'; readonly bean: BeanDetail }
  | { readonly kind: 'failed'; readonly error: AdapterError }
  /** Nothing ran: `busy` (same key still pending), `unreconciled` (uncertain write not dismissed), `unknown-bean`, `disposed`. */
  | { readonly kind: 'ignored'; readonly reason: 'busy' | 'unreconciled' | 'unknown-bean' | 'disposed' };

/** What the list area shows. Cached data stays visible with `stale` set when only a refresh failed. */
export type Status = 'loading' | 'empty' | 'no-matches' | 'ready' | 'disconnected' | 'invalid-data';

export interface Notice {
  readonly id: number;
  /** Beans that left the selection because they no longer exist. */
  readonly kind: 'selection-removed';
  readonly ids: readonly string[];
}

export interface ViewState {
  readonly scrollTop: number;
  readonly focusId: string | null;
}

export interface Snapshot {
  readonly status: Status;
  /** The last load failure; null after a successful load. */
  readonly failure: AdapterError | null;
  /** Cached data is shown although the last refresh failed. */
  readonly stale: boolean;
  readonly refreshing: boolean;
  /** Epoch milliseconds of the last successful load; null before the first. */
  readonly refreshedAt: number | null;
  /** Every cached bean in the default order. */
  readonly beans: readonly BeanSummary[];
  /** The beans matching the filters, in the same order. */
  readonly visible: readonly BeanSummary[];
  readonly invalid: readonly InvalidTaskFile[];
  readonly filters: Filters;
  /** The bean shown in the inspector. Kept when it vanishes, with `selectedGone` set. */
  readonly selectedId: string | null;
  readonly selectedGone: boolean;
  /** The explicit selection set, including beans hidden by the filters. */
  readonly selection: { readonly ids: readonly string[]; readonly hidden: number };
  readonly saves: ReadonlyMap<string, SaveState>;
  readonly drafts: readonly DraftEntry[];
  /** Drafts could not be written to plugin storage. */
  readonly draftsUnsaved: boolean;
  readonly notices: readonly Notice[];
}
