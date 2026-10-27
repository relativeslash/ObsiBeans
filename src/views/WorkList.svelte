<script lang="ts">
  import { tick } from 'svelte';
  import { isText, LIST_KEYS, type ActionId } from './actions.ts';
  import { listRows } from '../state/filters.ts';
  import type { BeanSummary, Change, Snapshot } from '../state/model.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import { describeError } from './errors.ts';
  import Board from './Board.svelte';
  import BulkBar from './BulkBar.svelte';
  import Hierarchy from './Hierarchy.svelte';
  import { t } from './i18n.ts';
  import type { Layout } from './layout.ts';
  import ListControls from './ListControls.svelte';

  interface Props {
    project: WorkspaceState;
    snapshot: Snapshot;
    /** False while another pane covers the list. The list stays mounted so nothing is lost. */
    active: boolean;
    columns: Layout['columns'];
    sort: Layout['sort'];
    view: Layout['view'];
    swimlanes: Layout['swimlanes'];
    onPrefs: (patch: Partial<Pick<Layout, 'columns' | 'sort' | 'view' | 'swimlanes'>>) => void;
    onOpen: (id: string) => void;
    onShowAll: () => void;
    /** Opens the creation form (the TUI's `c`). */
    onCreate?: (() => void) | undefined;
    /** Opens the creation form with this parent filled in (hierarchy rows). */
    onNewChild?: ((parentId: string) => void) | undefined;
    /** Back to the filters of the current navigation entry. */
    onReset: () => void;
    /** Opens the shortcut help (`?`). */
    onHelp: () => void;
  }
  let { project, snapshot, active, columns, sort, view, swimlanes, onPrefs, onOpen, onShowAll, onReset, onCreate, onNewChild, onHelp }: Props = $props();

  /** Scroll and focus are remembered per representation, so switching back lands where the user left. */
  const viewKey = $derived(`workspace-${view}`);
  let scroller: HTMLElement | undefined = $state();
  let controls: ListControls | undefined = $state();
  let wasActive = true;
  let pendingG = false;
  /** Open/closed parents in the hierarchy by full bean ID; kept here so switching views does not forget them. */
  let expanded = $state<ReadonlyMap<string, boolean>>(new Map());

  type Field = 'status' | 'type' | 'priority';
  const LISTS = { status: 'statuses', type: 'types', priority: 'priorities' } as const;
  /** The last edit tried per bean, so a conflict can be applied again on purpose. */
  const attempts = new Map<string, Change>();

  const rows = $derived(listRows(snapshot.beans, snapshot.visible, sort, project.vocabulary));
  const selected = $derived(new Set(snapshot.selection.ids));
  const controlsShown = $derived(snapshot.status === 'ready' || snapshot.status === 'no-matches');
  const shown = $derived(columns.filter((column) => column !== 'id'));

  /** A pending save shows the value the user asked for, never as data. */
  function valueOf(bean: BeanSummary, field: Field): string {
    const intent = snapshot.saves.get(bean.id);
    return intent?.kind === 'pending' && 'kind' in intent.intent && intent.intent.kind === 'fields' ? (intent.intent[field] ?? bean[field]) : bean[field];
  }

  /** One field edit, for the list's pickers and the board's Move: the same shared mutation either way. */
  async function change(bean: BeanSummary, field: Field, value: string): Promise<void> {
    const next = { kind: 'fields', [field]: value } as Change;
    attempts.set(bean.id, next);
    await project.mutate(bean.id, next);
  }

  async function edit(event: Event, bean: BeanSummary, field: Field): Promise<void> {
    const select = event.currentTarget as HTMLSelectElement;
    await change(bean, field, select.value);
    // Unsaved means the cached value stands, so the picker must not keep showing the choice.
    select.value = project.getSnapshot().beans.find((one) => one.id === bean.id)?.[field] ?? select.value;
  }

  const overwrite = (id: string, revision: string, change: Change): void => {
    void project.mutate(id, change, revision);
  };

  /** Escape clears one thing per press: the selection, then the tag filter, then the search text. It never closes anything. */
  function clearOne(): boolean {
    if (snapshot.selection.ids.length > 0) project.clearSelection();
    else if (snapshot.filters.tags.length > 0) project.setFilters({ tags: [] });
    else if (snapshot.filters.search !== '') project.setFilters({ search: '' });
    else return false;
    return true;
  }

  /** The palette's way in: the same actions as the keys and the visible controls. */
  export function run(action: ActionId): void {
    const views = { viewList: 'list', viewBoard: 'board', viewHierarchy: 'hierarchy' } as const;
    if (action === 'new') onCreate?.();
    else if (action === 'search') controls?.focusSearch();
    else if (action === 'tags') controls?.focusTags();
    else if (action === 'copy') void controls?.copy();
    else if (action === 'selectAll') project.selectVisible();
    else if (action === 'clearSelection') project.clearSelection();
    else if (action in views) onPrefs({ view: views[action as keyof typeof views] });
  }

  /** Familiar bindings (design: TUI parity), active only outside text fields. Every one has a visible control and a command too. */
  function onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isText(target)) return;
    if (event.key === 'Escape') {
      if (clearOne()) event.preventDefault();
      return;
    }
    const armed = pendingG;
    pendingG = event.key === 'g';
    if (armed && event.key === 't') return run('tags');
    const action = LIST_KEYS[event.key];
    if (action === 'search' || action === 'help') event.preventDefault();
    if (action === 'help') return onHelp();
    if (action) return run(action);
    if (!target.matches('button.row')) return;
    const all = [...(scroller?.querySelectorAll<HTMLElement>('button.row') ?? [])];
    const at = all.indexOf(target);
    // A page is as many rows as fit; jsdom and hidden panes have no size, so fall back to ten.
    const height = target.getBoundingClientRect().height;
    const page = height > 0 && scroller ? Math.max(1, Math.floor(scroller.clientHeight / height)) : 10;
    const move = (to: number): void => {
      event.preventDefault();
      all[Math.min(all.length - 1, Math.max(0, to))]?.focus();
    };
    if (event.key === 'j' || event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'k' || event.key === 'ArrowUp') move(at - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(all.length - 1);
    else if (event.key === 'PageDown') move(at + page);
    else if (event.key === 'PageUp') move(at - page);
    else if (event.key === ' ') {
      if (target.dataset.context === undefined) project.toggleSelected(target.dataset.id ?? '');
      move(at + 1);
    }
  }

  const remember = (focusId: string | null): void => {
    project.setViewState(viewKey, { scrollTop: scroller?.scrollTop ?? 0, focusId });
  };

  // A hidden element forgets its scroll position, so the saved one is put back when the list returns.
  $effect(() => {
    const returning = active && !wasActive;
    wasActive = active;
    if (!active || !scroller) return;
    const saved = project.getViewState(viewKey);
    scroller.scrollTop = saved?.scrollTop ?? 0;
    if (returning && saved?.focusId) {
      const root = scroller;
      const focusId = saved.focusId;
      void tick().then(() => root.querySelector<HTMLElement>(`[data-id="${CSS.escape(focusId)}"]`)?.focus());
    }
  });
</script>

<!-- Shortcuts bubble from the controls and rows; each one also has a visible control. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pane" onkeydown={onKey}>
{#if controlsShown}
  <ListControls bind:this={controls} {project} {snapshot} {columns} {sort} {view} {swimlanes} {onPrefs} {onReset} />
{/if}
{#if controlsShown}<BulkBar {project} {snapshot} />{/if}
<div class="list" bind:this={scroller} onscroll={() => { remember(project.getViewState(viewKey)?.focusId ?? null); }}>
  {#if snapshot.stale}
    <div class="banner" role="alert">
      <span>{t('list.stale', { time: snapshot.refreshedAt === null ? '' : new Date(snapshot.refreshedAt).toLocaleTimeString('en') })}{snapshot.failure ? ` ${describeError(snapshot.failure)}` : ''}</span>
      <button type="button" disabled={snapshot.refreshing} onclick={() => void project.refresh()}>{t('action.refresh')}</button>
    </div>
  {/if}
  {#each snapshot.notices as notice (notice.id)}
    <div class="banner" role="status">
      <span>{t('list.selectionRemoved', { count: notice.ids.length })}</span>
      <button type="button" onclick={() => { project.dismissNotice(notice.id); }}>{t('action.dismiss')}</button>
    </div>
  {/each}
  {#if snapshot.invalid.length > 0 && snapshot.status !== 'invalid-data'}
    <p class="banner" role="status">{t('list.invalidFiles', { count: snapshot.invalid.length })}</p>
  {/if}

  {#if snapshot.status === 'loading'}
    <p class="message" role="status">{t('list.loading')}</p>
  {:else if snapshot.status === 'empty'}
    <p class="message" role="status">{t('list.empty')}</p>
  {:else if snapshot.status === 'no-matches'}
    <div class="message" role="status">
      <p>{t('list.noMatches')}</p>
      <button type="button" onclick={onShowAll}>{t('list.showAll')}</button>
    </div>
  {:else if snapshot.status === 'disconnected' || snapshot.status === 'invalid-data'}
    <div class="message" role="alert">
      <p>{snapshot.failure ? describeError(snapshot.failure) : t(`list.${snapshot.status}`)}</p>
      {#if snapshot.status === 'invalid-data'}
        <ul>
          {#each snapshot.invalid as file (file.path)}
            <li>{t(`list.invalid.${file.reason}`, { path: file.path })}</li>
          {/each}
        </ul>
      {/if}
      <button type="button" disabled={snapshot.refreshing} onclick={() => void project.refresh()}>{t('action.retry')}</button>
    </div>
  {:else if view === 'board'}
    <Board
      {project}
      {snapshot}
      {sort}
      {swimlanes}
      {onOpen}
      onMove={(bean, status) => change(bean, 'status', status)}
      overwrite={(id) => (attempts.has(id) ? (revision) => { overwrite(id, revision, attempts.get(id) ?? { kind: 'fields' }); } : undefined)}
      onFocus={remember}
    />
  {:else if view === 'hierarchy'}
    <Hierarchy {project} {snapshot} {sort} bind:expanded {onOpen} {onNewChild} onFocus={remember} />
  {:else}
    <ul class="rows" aria-label={t('list.label', { count: snapshot.visible.length })}>
      <!-- Keyed by file: two files can claim one ID, and a duplicate key would stop the whole view from rendering. -->
      {#each rows as { bean, context } (bean.path)}
        {@const save = snapshot.saves.get(bean.id)}
        {@const locked = bean.problems.length > 0 || save?.kind === 'pending' || save?.kind === 'uncertain'}
        <li class="item" class:context>
          {#if context}
            <span class="check"></span>
          {:else}
            <input type="checkbox" class="check" aria-label={t('row.select', { id: bean.id })} checked={selected.has(bean.id)} onchange={() => { project.toggleSelected(bean.id); }} />
          {/if}
          <button
            type="button"
            class="row"
            data-id={bean.id}
            data-context={context ? '' : undefined}
            aria-current={snapshot.selectedId === bean.id ? 'true' : undefined}
            onfocus={() => { remember(bean.id); }}
            onclick={() => { onOpen(bean.id); }}
          >
            {#if columns.includes('id')}<span class="id">{bean.id}</span>{/if}
            <span class="title">{bean.title}</span>
            {#if context}<span class="badge">{t('list.context')}</span>{/if}
          </button>
          {#each shown as column (column)}
            {#if column === 'tags'}
              <span class="cell tags">{bean.tags.join(' ')}</span>
            {:else if column === 'updated'}
              <span class="cell">{bean.updatedAt.slice(0, 10)}</span>
            {:else if context}
              <span class="cell">{bean[column]}</span>
            {:else}
              <select
                class="cell"
                aria-label={t(`row.${column}`, { id: bean.id })}
                title={bean.problems.length > 0 ? t('row.locked') : undefined}
                disabled={locked}
                value={valueOf(bean, column)}
                onchange={(event) => void edit(event, bean, column)}
              >
                {#each project.vocabulary[LISTS[column]] as value (value)}<option {value}>{value}</option>{/each}
                {#if !project.vocabulary[LISTS[column]].includes(bean[column])}<option value={bean[column]}>{bean[column]}</option>{/if}
              </select>
            {/if}
          {/each}
          {#if save}
            <span class="feedback" role={save.kind === 'pending' ? 'status' : 'alert'}>
              {#if save.kind === 'pending'}
                {t('row.saving')}
              {:else}
                {save.kind === 'conflict' ? t('row.conflict') : t(`save.${save.kind}`, { message: describeError(save.error) })}
                {#if save.kind === 'conflict' && save.error.current?.revision && attempts.has(bean.id)}
                  <button type="button" onclick={() => { overwrite(bean.id, save.error.current?.revision ?? '', attempts.get(bean.id) ?? { kind: 'fields' }); }}>{t('row.applyAgain')}</button>
                {/if}
                <button type="button" onclick={() => { project.dismissSave(bean.id); }}>{t('action.dismiss')}</button>
              {/if}
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
</div>

<style>
  /* At high zoom the controls could fill the pane and squeeze the list out: the list keeps a minimum height and the pane scrolls instead. */
  .pane { display: flex; flex-direction: column; height: 100%; min-width: 0; overflow-y: auto; }
  .list { flex: 1 1 12rem; overflow-y: auto; min-width: 0; min-height: 12rem; }
  .rows, .message ul { margin: 0; padding: 0; list-style: none; }
  .message { padding: var(--size-4-4); color: var(--text-muted); }
  .banner { display: flex; gap: var(--size-4-2); align-items: center; justify-content: space-between; margin: var(--size-4-2); padding: var(--size-4-2) var(--size-4-3); border-radius: var(--radius-s); background: var(--background-modifier-message); }
  /* Off-screen rows are skipped by the browser, which keeps long lists cheap without a virtual list. */
  .item { display: flex; flex-wrap: wrap; gap: var(--size-4-2); align-items: center; padding-inline: var(--size-4-3); content-visibility: auto; contain-intrinsic-size: auto 2.5rem; }
  .item:hover { background: var(--background-modifier-hover); }
  .item.context { color: var(--text-muted); font-style: italic; }
  .check { width: 1rem; flex: none; }
  .row { display: flex; flex: 1; min-width: 12rem; gap: var(--size-4-3); align-items: baseline; justify-content: flex-start; height: auto; padding: var(--row-padding, var(--size-4-2)) var(--size-4-2); text-align: start; background: transparent; box-shadow: none; border-radius: 0; color: inherit; }
  .row[aria-current='true'] { background: var(--background-modifier-active-hover); box-shadow: inset 3px 0 0 var(--interactive-accent); }
  .id { font-family: var(--font-monospace); font-size: var(--font-ui-smaller); color: var(--text-muted); white-space: nowrap; }
  .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { font-size: var(--font-ui-smaller); padding: 0 var(--size-4-2); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); color: var(--text-muted); white-space: nowrap; }
  .cell { width: 7rem; font-size: var(--font-ui-smaller); }
  .tags { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .feedback { flex-basis: 100%; padding-inline-start: 1.5rem; font-size: var(--font-ui-smaller); color: var(--text-error); }
</style>
