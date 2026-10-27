import type { AdapterError, BeanDetail, BeanSummary, Outcome } from '../adapter/beans-model.ts';
import type { ProjectRead } from '../adapter/beans-read.ts';
import type { Change, NewBean } from '../adapter/beans-write.ts';
import { classify, removeDraft, restoration, upsertDraft } from './drafts.ts';
import { matchesFilters, orderBeans, type Readiness } from './filters.ts';
import { Loader } from './loader.ts';
import {
  DEFAULT_FILTERS,
  type BeansPort,
  type Defaults,
  type Draft,
  type DraftKind,
  type Filters,
  type MutationResult,
  type Notice,
  type Restoration,
  type SaveState,
  type Snapshot,
  type Status,
  type ViewState,
  type Vocabulary,
} from './model.ts';

export interface WorkspaceStateOptions {
  readonly port: BeansPort;
  readonly vocabulary: Vocabulary;
  readonly defaults: Defaults;
  /** Task root relative to the vault, with `/` separators; empty when the task root is the vault root. */
  readonly taskRoot: string;
  /** Drafts as stored. The state keeps the list from here on and hands every change to `saveDrafts`. */
  readonly drafts: readonly Draft[];
  /** Writes the complete draft list to plugin storage. Calls never overlap. */
  readonly saveDrafts: (drafts: readonly Draft[]) => Promise<void>;
  /** Epoch milliseconds. */
  readonly now: () => number;
  /** Quiet time before a burst of vault events becomes one refresh. */
  readonly debounceMs?: number;
  /** Quiet time before edited drafts are written. */
  readonly draftSaveMs?: number;
}

interface Cache {
  readonly beans: readonly BeanSummary[];
  readonly byId: ReadonlyMap<string, BeanSummary>;
  readonly read: ProjectRead;
  readonly readiness: Readiness;
  readonly refreshedAt: number;
}

/** Save-state key of a creation, which has no bean ID yet. */
const NEW = 'new:';

function listen(listener: () => void): void {
  try {
    listener();
  } catch (error) {
    console.error('ObsiBeans: a state listener failed', error);
  }
}

/**
 * The one application state and action layer behind every view and command: the project cache, filters, selection,
 * mutations and recoverable drafts of one bound project. Everything backend-derived is a disposable cache.
 *
 * Lifecycle: construction only validates and copies; `start` loads; `dispose` stops every timer, listener and
 * request and writes pending drafts. A state that was disposed ignores every call. A project switch disposes this
 * state and builds a new one, so an answer for the old project can never reach the new one.
 */
export class WorkspaceState {
  private readonly options: WorkspaceStateOptions;
  private readonly loader: Loader;
  private readonly listeners = new Set<() => void>();
  private readonly viewStates = new Map<string, ViewState>();
  private cache: Cache | undefined;
  private failure: AdapterError | null = null;
  private refreshing = false;
  private filters: Filters = DEFAULT_FILTERS;
  private selectedId: string | null = null;
  private selected: ReadonlySet<string> = new Set();
  private saves: ReadonlyMap<string, SaveState> = new Map();
  private drafts: readonly Draft[];
  private draftsUnsaved = false;
  private draftsDirty = false;
  private draftTimer: ReturnType<typeof setTimeout> | undefined;
  private draftWrites: Promise<void> = Promise.resolve();
  private notices: readonly Notice[] = [];
  private nextNotice = 1;
  private started = false;
  private disposed = false;
  private visible: { readonly source: Cache | undefined; readonly filters: Filters; readonly beans: readonly BeanSummary[] } | undefined;
  private current: Snapshot;

  constructor(options: WorkspaceStateOptions) {
    const { debounceMs = 300, draftSaveMs = 400 } = options;
    if (!Number.isFinite(debounceMs) || debounceMs < 0 || !Number.isFinite(draftSaveMs) || draftSaveMs < 0) {
      throw new RangeError('Debounce times must be finite and not negative.');
    }
    this.options = { ...options, debounceMs, draftSaveMs };
    this.drafts = [...options.drafts];
    this.loader = new Loader({
      load: (signal) => options.port.list(signal),
      settled: (outcome) => {
        if (outcome.ok) this.accept(outcome.value);
        else this.failure = outcome.error;
        this.changed();
      },
      busy: (busy) => {
        this.refreshing = busy;
        this.changed();
      },
      debounceMs,
    });
    this.current = this.build();
  }

  /** The fixed value lists, for pickers and sorting. */
  get vocabulary(): Vocabulary {
    return this.options.vocabulary;
  }

  /** The values a creation form shows for fields the user leaves open. */
  get defaults(): Defaults {
    return this.options.defaults;
  }

  /** Reads one bean with its description. Not cached: the caller decides when its revision calls for a re-read. */
  async detail(id: string): Promise<Outcome<BeanDetail | null>> {
    try {
      return await this.options.port.get(id);
    } catch (error) {
      return { ok: false, error: { kind: 'backend', code: 'failed', message: error instanceof Error ? error.message : String(error) } };
    }
  }

  /** Starts the first load. Calling it again, or after `dispose`, does nothing. */
  start(): Promise<void> {
    if (this.started || this.disposed) return Promise.resolve();
    this.started = true;
    return this.loader.refresh();
  }

  /** The explicit Refresh action: loads now, replacing a load in flight. */
  refresh(): Promise<void> {
    return this.disposed ? Promise.resolve() : this.loader.refresh();
  }

  /** The newest state. A new object after every change, so equal references mean nothing changed. */
  getSnapshot(): Snapshot {
    return this.current;
  }

  /** Calls `listener` after every change. Returns the function that stops it. */
  subscribe(listener: () => void): () => void {
    if (!this.disposed) this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Stops everything, writes pending drafts and resolves when they are written. Safe to call twice. */
  async dispose(): Promise<void> {
    if (this.disposed) return this.draftWrites;
    this.disposed = true;
    this.loader.dispose();
    this.listeners.clear();
    clearTimeout(this.draftTimer);
    if (this.draftsDirty) this.writeDrafts();
    await this.draftWrites;
  }

  /** Vault event wiring: `path` is vault-relative; `oldPath` is the previous path of a rename. */
  vaultChanged(path: string, oldPath?: string): void {
    if (this.started && !this.disposed && [path, ...(oldPath === undefined ? [] : [oldPath])].some((candidate) => this.inTaskRoot(candidate))) this.loader.request();
  }

  private inTaskRoot(path: string): boolean {
    const root = this.options.taskRoot;
    const inside = root === '' || path === root || path.startsWith(`${root}/`);
    // Beans loads Markdown files only; a path without an extension may be a folder moved in or out.
    return inside && (path.endsWith('.md') || !(path.split('/').pop() ?? '').includes('.'));
  }

  // --- Filters, selection, per-view state ---------------------------------------------------

  setFilters(patch: Partial<Filters>): void {
    this.filters = { ...this.filters, ...patch };
    this.changed();
  }

  /** The bean shown in the inspector. Unknown IDs are ignored; `null` clears it. */
  select(id: string | null): void {
    if (id !== null && !this.cache?.byId.has(id)) return;
    this.selectedId = id;
    this.changed();
  }

  /** Adds or removes one bean from the explicit selection set. Only existing beans can be selected, so context rows never are. */
  toggleSelected(id: string): void {
    if (!this.cache?.byId.has(id)) return;
    const next = new Set(this.selected);
    if (!next.delete(id)) next.add(id);
    this.selected = next;
    this.changed();
  }

  /** Replaces the selection with the given beans that exist. */
  setSelected(ids: readonly string[]): void {
    const byId = this.cache?.byId;
    this.selected = new Set(byId ? ids.filter((id) => byId.has(id)) : []);
    this.changed();
  }

  selectVisible(): void {
    this.setSelected(this.current.visible.map((bean) => bean.id));
  }

  clearSelection(): void {
    this.setSelected([]);
  }

  dismissNotice(id: number): void {
    this.notices = this.notices.filter((notice) => notice.id !== id);
    this.changed();
  }

  /** Remembers scroll and focus of a view across refreshes and remounts. Does not notify: scrolling must not re-render. */
  setViewState(view: string, state: ViewState): void {
    if (!this.disposed) this.viewStates.set(view, state);
  }

  getViewState(view: string): ViewState | undefined {
    return this.viewStates.get(view);
  }

  // --- Mutations ----------------------------------------------------------------------------

  /**
   * Applies one change to one bean. `basis` is the revision the user's edit started from; it defaults to the cached
   * one. Nothing is shown as saved until Beans confirms. A second call for the same bean while the first is pending
   * is ignored, so repeated clicks cannot write twice. After an `uncertain` result the bean accepts nothing until
   * `dismissSave`, because a retry could duplicate the write.
   */
  async mutate(id: string, change: Change, basis?: string): Promise<MutationResult> {
    const bean = this.cache?.byId.get(id);
    if (bean === undefined) return { kind: 'ignored', reason: this.disposed ? 'disposed' : 'unknown-bean' };
    const revision = basis ?? bean.revision;
    const result = await this.write(id, change, () =>
      revision === null
        ? Promise.resolve({ ok: false as const, error: { kind: 'preservation' as const, code: 'invalid-bean' as const, detail: 'The bean file cannot be read.' } })
        : this.options.port.mutate(id, revision, change),
    );
    if (result.kind === 'failed' && change.kind === 'body') this.keepDraft('description', id, change.body, revision);
    if (result.kind === 'saved' && change.kind === 'body') this.discardDraft('description', id);
    return result;
  }

  /** Creates a bean. `localKey` identifies the form, and its creation draft, until the bean has an ID. */
  async create(localKey: string, bean: NewBean): Promise<MutationResult> {
    const result = await this.write(`${NEW}${localKey}`, bean, () => this.options.port.create(bean));
    if (result.kind === 'saved') this.discardDraft('creation', localKey);
    return result;
  }

  /** Clears a failed, conflicting or uncertain result once the user has dealt with it. */
  dismissSave(key: string): void {
    if (this.saves.get(key)?.kind === 'pending') return;
    const next = new Map(this.saves);
    if (next.delete(key)) {
      this.saves = next;
      this.changed();
    }
  }

  private async write(key: string, intent: Change | NewBean, call: () => ReturnType<BeansPort['create']>): Promise<MutationResult> {
    if (this.disposed) return { kind: 'ignored', reason: 'disposed' };
    const state = this.saves.get(key)?.kind;
    if (state === 'pending') return { kind: 'ignored', reason: 'busy' };
    if (state === 'uncertain') return { kind: 'ignored', reason: 'unreconciled' };
    this.setSave(key, { kind: 'pending', intent });
    let outcome: Awaited<ReturnType<typeof call>>;
    try {
      outcome = await call();
    } catch (error) {
      // The adapter never rejects; if it does, the write may have happened.
      outcome = { ok: false, error: { kind: 'uncertain', message: error instanceof Error ? error.message : String(error), current: null, createdIds: [] } };
    }
    if (this.isDisposed()) return { kind: 'ignored', reason: 'disposed' };
    if (outcome.ok) {
      this.patch(outcome.value);
      this.setSave(key, undefined);
      return { kind: 'saved', bean: outcome.value };
    }
    const { error } = outcome;
    this.setSave(key, error.kind === 'conflict' ? { kind: 'conflict', error } : error.kind === 'uncertain' ? { kind: 'uncertain', error } : { kind: 'failed', error });
    // Fresh backend data is what a conflict review or an uncertain result is reconciled against.
    if (error.kind === 'conflict' || error.kind === 'uncertain') this.loader.request();
    return { kind: 'failed', error };
  }

  /** A method, because the compiler cannot see that `dispose` may run while a call awaits. */
  private isDisposed(): boolean {
    return this.disposed;
  }

  private setSave(key: string, state: SaveState | undefined): void {
    const next = new Map(this.saves);
    if (state === undefined) next.delete(key);
    else next.set(key, state);
    this.saves = next;
    this.changed();
  }

  /** Shows a confirmed write at once, then reloads: relationships and readiness of other beans may have changed too. */
  private patch(detail: BeanDetail): void {
    const cache = this.cache;
    if (cache) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- rows carry no description
      const { body, ...summary } = detail;
      const beans = [...cache.beans.filter((bean) => bean.id !== detail.id), summary];
      this.cache = this.cacheOf({ ...cache.read, beans }, cache.refreshedAt);
    }
    this.loader.supersede();
    this.loader.request();
  }

  // --- Drafts -------------------------------------------------------------------------------

  /** Records unsaved text. Returns false when the draft list is full and the text could not be kept. */
  setDraft(kind: DraftKind, key: string, text: string, revision: string | null): boolean {
    const next = this.disposed ? undefined : upsertDraft(this.drafts, { kind, key, text, revision, savedAt: new Date(this.options.now()).toISOString() });
    if (next === undefined) return false;
    this.storeDrafts(next);
    return true;
  }

  /** Explicit discard, or the end of a successful save. */
  discardDraft(kind: DraftKind, key: string): void {
    const next = removeDraft(this.drafts, kind, key);
    if (next.length !== this.drafts.length) this.storeDrafts(next);
  }

  /** Never overwrites anything: a bean that changed since the draft needs conflict review first. */
  restoreDraft(kind: DraftKind, key: string): Restoration {
    const draft = this.drafts.find((other) => other.kind === kind && other.key === key);
    return draft ? restoration(draft, this.cache?.byId) : { kind: 'unavailable' };
  }

  private keepDraft(kind: DraftKind, key: string, text: string, revision: string | null): void {
    if (!this.drafts.some((draft) => draft.kind === kind && draft.key === key && draft.text === text)) this.setDraft(kind, key, text, revision);
  }

  private storeDrafts(drafts: readonly Draft[]): void {
    this.drafts = drafts;
    this.draftsDirty = true;
    clearTimeout(this.draftTimer);
    if (!this.disposed) this.draftTimer = setTimeout(() => { this.writeDrafts(); }, this.options.draftSaveMs);
    this.changed();
  }

  /** Writes the current list after the previous write ends. Failure is shown as `draftsUnsaved`, never thrown. */
  private writeDrafts(): void {
    this.draftsDirty = false;
    this.draftWrites = this.draftWrites.then(async () => {
      try {
        await this.options.saveDrafts(this.drafts);
        this.draftsUnsaved = false;
      } catch {
        this.draftsUnsaved = true;
      }
      this.changed();
    });
  }

  // --- Loading ------------------------------------------------------------------------------

  private accept(read: ProjectRead): void {
    this.failure = null;
    const cache = this.cacheOf(read, this.options.now());
    this.cache = cache;
    const gone = [...this.selected].filter((id) => !cache.byId.has(id));
    if (gone.length > 0) {
      this.selected = new Set([...this.selected].filter((id) => cache.byId.has(id)));
      this.notices = [...this.notices, { id: this.nextNotice++, kind: 'selection-removed', ids: gone }];
    }
  }

  private cacheOf(read: ProjectRead, refreshedAt: number): Cache {
    const beans = orderBeans(read.beans, this.options.vocabulary);
    return {
      beans,
      byId: new Map(beans.map((bean) => [bean.id, bean])),
      read,
      readiness: { blocked: new Set(read.blockedIds), ready: new Set(read.readyIds) },
      refreshedAt,
    };
  }

  // --- Snapshot -----------------------------------------------------------------------------

  private changed(): void {
    if (this.disposed) return;
    this.current = this.build();
    for (const listener of [...this.listeners]) listen(listener);
  }

  private visibleBeans(): readonly BeanSummary[] {
    const { cache, filters, visible } = this;
    if (visible !== undefined && visible.source === cache && visible.filters === filters) return visible.beans;
    const beans = cache ? cache.beans.filter((bean) => matchesFilters(bean, filters, cache.readiness)) : [];
    this.visible = { source: cache, filters, beans };
    return beans;
  }

  private status(visible: readonly BeanSummary[]): Status {
    if (this.cache) return this.cache.beans.length === 0 ? 'empty' : visible.length === 0 ? 'no-matches' : 'ready';
    if (!this.failure) return 'loading';
    return this.failure.kind === 'backend' && this.failure.code === 'invalid-data' ? 'invalid-data' : 'disconnected';
  }

  private build(): Snapshot {
    const { cache } = this;
    const visible = this.visibleBeans();
    const visibleIds = new Set(visible.map((bean) => bean.id));
    const ids = [...this.selected];
    return {
      status: this.status(visible),
      failure: this.failure,
      stale: this.failure !== null && cache !== undefined,
      refreshing: this.refreshing,
      refreshedAt: cache?.refreshedAt ?? null,
      beans: cache?.beans ?? [],
      visible,
      invalid: cache?.read.invalid ?? [],
      filters: this.filters,
      selectedId: this.selectedId,
      selectedGone: this.selectedId !== null && cache !== undefined && !cache.byId.has(this.selectedId),
      selection: { ids, hidden: ids.filter((id) => !visibleIds.has(id)).length },
      saves: this.saves,
      drafts: this.drafts.map((draft) => classify(draft, cache?.byId)),
      draftsUnsaved: this.draftsUnsaved,
      notices: this.notices,
    };
  }
}
