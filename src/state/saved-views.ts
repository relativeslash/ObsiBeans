import type { Swimlanes } from './board.ts';
import { SORT_KEYS, type Filters, type Sort, type Vocabulary } from './model.ts';

/** Version of the plugin data file. Older files are migrated one step at a time; a newer one is kept untouched. */
export const SCHEMA_VERSION = 1;

/** The work view representations, in switch order. */
export const REPRESENTATIONS = ['list', 'board', 'hierarchy'] as const;
export type Representation = (typeof REPRESENTATIONS)[number];

const READINESS: readonly Filters['readiness'][] = ['any', 'ready', 'blocked'];
const SWIMLANES: readonly Swimlanes[] = ['none', 'parent'];

/** What a saved view stores besides its identity: the shared filters plus presentation (design: Saved views). */
export interface ViewContent extends Filters {
  readonly representation: Representation;
  readonly sort: Sort;
  readonly swimlanes: Swimlanes;
}

export interface SavedView extends ViewContent {
  /** Random, never shown. */
  readonly id: string;
  /** Unique among saved views, ignoring case. */
  readonly name: string;
}

/** A stored entry is a usable view, or raw data that could not be read. Invalid entries are written back as they were. */
export type ViewEntry =
  | { readonly kind: 'view'; readonly view: SavedView }
  | { readonly kind: 'invalid'; readonly raw: unknown; readonly reason: InvalidReason };

/** `newer`: written by a newer plugin. `duplicate`: id or name already used by an earlier entry. Otherwise the broken field. */
export type InvalidReason = 'newer' | 'duplicate' | 'list' | 'entry' | 'id' | 'name' | 'search' | 'filters' | 'readiness' | 'representation' | 'sort' | 'swimlanes';

export interface StoredViews {
  readonly schemaVersion: number;
  readonly entries: readonly ViewEntry[];
}

export const viewFilters = (view: Filters): Filters => ({
  search: view.search,
  statuses: view.statuses,
  types: view.types,
  priorities: view.priorities,
  tags: view.tags,
  readiness: view.readiness,
});

const nameKey = (name: string): string => name.trim().toLowerCase();
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((one) => typeof one === 'string');

/** The first problem with one stored view, or the view. */
function parseView(raw: unknown): SavedView | InvalidReason {
  if (typeof raw !== 'object' || raw === null) return 'entry';
  const v = raw as Record<string, unknown>;
  if (typeof v.id !== 'string' || v.id === '') return 'id';
  if (typeof v.name !== 'string' || v.name.trim() === '') return 'name';
  if (typeof v.search !== 'string') return 'search';
  if (!strings(v.statuses) || !strings(v.types) || !strings(v.priorities) || !strings(v.tags)) return 'filters';
  const readiness = READINESS.find((one) => one === v.readiness);
  if (readiness === undefined) return 'readiness';
  const representation = REPRESENTATIONS.find((one) => one === v.representation);
  if (representation === undefined) return 'representation';
  const sort = typeof v.sort === 'object' && v.sort !== null ? (v.sort as Record<string, unknown>) : {};
  const key = SORT_KEYS.find((one) => one === sort.key);
  if (key === undefined || typeof sort.descending !== 'boolean') return 'sort';
  const swimlanes = SWIMLANES.find((one) => one === v.swimlanes);
  if (swimlanes === undefined) return 'swimlanes';
  return {
    id: v.id,
    name: v.name.trim(),
    search: v.search,
    statuses: v.statuses,
    types: v.types,
    priorities: v.priorities,
    tags: v.tags,
    readiness,
    representation,
    sort: { key, descending: sort.descending },
    swimlanes,
  };
}

/** One step per version: `STEPS[n]` turns version `n` data into version `n + 1`. */
const STEPS: readonly ((data: Record<string, unknown>) => Record<string, unknown>)[] = [
  // 0 -> 1: the first data file with saved views. Earlier files hold settings and drafts only.
  (data) => ({ ...data, savedViews: data.savedViews ?? [] }),
];

/**
 * Reads the saved views of the plugin data file. A damaged entry never blocks its neighbours: it stays as an invalid
 * entry holding the raw value, so the user can delete it, and nothing is lost by saving again.
 */
export function loadViews(data: unknown): StoredViews {
  let stored: Record<string, unknown> = typeof data === 'object' && data !== null ? { ...data } : {};
  const found = stored.schemaVersion;
  let version = typeof found === 'number' && Number.isInteger(found) && found >= 0 ? found : 0;
  const raws = (): unknown[] => (stored.savedViews === undefined ? [] : Array.isArray(stored.savedViews) ? (stored.savedViews as unknown[]) : [stored.savedViews]);
  if (version > SCHEMA_VERSION) {
    return { schemaVersion: version, entries: raws().map((raw) => ({ kind: 'invalid', raw, reason: 'newer' })) };
  }
  for (; version < SCHEMA_VERSION; version++) stored = STEPS[version]?.(stored) ?? stored;
  if (stored.savedViews !== undefined && !Array.isArray(stored.savedViews)) {
    return { schemaVersion: SCHEMA_VERSION, entries: [{ kind: 'invalid', raw: stored.savedViews, reason: 'list' }] };
  }
  const entries: ViewEntry[] = [];
  for (const raw of raws()) {
    const parsed = parseView(raw);
    if (typeof parsed === 'string') entries.push({ kind: 'invalid', raw, reason: parsed });
    else if (entries.some((one) => one.kind === 'view' && (one.view.id === parsed.id || nameKey(one.view.name) === nameKey(parsed.name)))) {
      entries.push({ kind: 'invalid', raw, reason: 'duplicate' });
    } else entries.push({ kind: 'view', view: parsed });
  }
  return { schemaVersion: SCHEMA_VERSION, entries };
}

/** The value to store: valid views as they are, invalid entries exactly as they were read. */
export const serializeViews = (entries: readonly ViewEntry[]): unknown[] => entries.map((entry) => (entry.kind === 'view' ? entry.view : entry.raw));

export type ViewChange =
  | { readonly kind: 'save'; readonly name: string; readonly content: ViewContent }
  /** Replaces the filters and presentation of a view, keeping its name. */
  | { readonly kind: 'update'; readonly id: string; readonly content: ViewContent }
  | { readonly kind: 'rename'; readonly id: string; readonly name: string }
  /** Removes one entry, valid or not. Only the plugin's own data changes; no bean is touched. */
  | { readonly kind: 'remove'; readonly entry: ViewEntry };

export type ViewFailure = 'name-empty' | 'name-taken' | 'missing' | 'storage';

export type ViewResult =
  | { readonly ok: true; readonly entries: readonly ViewEntry[]; /** The saved view's ID after `save`. */ readonly id?: string }
  | { readonly ok: false; readonly reason: ViewFailure };

/** The entries after one change. `newId` is used only by `save`. Pure: the caller stores the result. */
export function applyViewChange(entries: readonly ViewEntry[], change: ViewChange, newId: string): ViewResult {
  if (change.kind === 'remove') return entries.includes(change.entry) ? { ok: true, entries: entries.filter((one) => one !== change.entry) } : { ok: false, reason: 'missing' };
  const id = change.kind === 'save' ? newId : change.id;
  const exists = entries.some((one) => one.kind === 'view' && one.view.id === id);
  if (change.kind !== 'save' && !exists) return { ok: false, reason: 'missing' };
  const name = change.kind === 'save' || change.kind === 'rename' ? change.name.trim() : undefined;
  if (name === '') return { ok: false, reason: 'name-empty' };
  if (name !== undefined && entries.some((one) => one.kind === 'view' && one.view.id !== id && nameKey(one.view.name) === nameKey(name))) return { ok: false, reason: 'name-taken' };
  if (change.kind === 'save') return { ok: true, entries: [...entries, { kind: 'view', view: { id, name: name ?? '', ...change.content } }], id };
  const next = entries.map((one): ViewEntry =>
    one.kind !== 'view' || one.view.id !== id ? one : { kind: 'view', view: change.kind === 'rename' ? { ...one.view, name: name ?? one.view.name } : { ...one.view, ...change.content } });
  return { ok: true, entries: next, id };
}

/**
 * Stored filter values the backend no longer reports, e.g. a removed status or a tag no bean has. They stay in the
 * view and still filter; this only names them so the user sees why nothing matches. `tags` is undefined until the
 * project has been read, so a slow load never reports every tag.
 */
export function unmatchedValues(view: Filters, vocabulary: Vocabulary, tags: Iterable<string> | undefined): string[] {
  const missing = (kind: string, values: readonly string[], known: Iterable<string> | undefined): string[] => {
    const set = new Set(known);
    return known === undefined ? [] : values.filter((value) => !set.has(value)).map((value) => `${kind}:${value}`);
  };
  return [
    ...missing('status', view.statuses, vocabulary.statuses),
    ...missing('type', view.types, vocabulary.types),
    ...missing('priority', view.priorities, vocabulary.priorities),
    ...missing('tag', view.tags, tags),
  ];
}

/** Content of a new view: the filters and presentation on screen. */
export const contentOf = (filters: Filters, shown: { readonly view: Representation; readonly sort: Sort; readonly swimlanes: Swimlanes }): ViewContent => ({
  ...viewFilters(filters),
  representation: shown.view,
  sort: shown.sort,
  swimlanes: shown.swimlanes,
});
