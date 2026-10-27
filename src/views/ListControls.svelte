<script lang="ts">
  import { tagCounts } from '../state/filters.ts';
  import { SORT_KEYS, type Snapshot, type SortKey } from '../state/model.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import { t, type MessageKey } from './i18n.ts';
  import { COLUMN_IDS, type Layout } from './layout.ts';

  interface Props {
    project: WorkspaceState;
    snapshot: Snapshot;
    columns: Layout['columns'];
    sort: Layout['sort'];
    view: Layout['view'];
    swimlanes: Layout['swimlanes'];
    onPrefs: (patch: Partial<Pick<Layout, 'columns' | 'sort' | 'view' | 'swimlanes'>>) => void;
    /** Back to the filters of the current navigation entry. */
    onReset: () => void;
  }
  let { project, snapshot, columns, sort, view, swimlanes, onPrefs, onReset }: Props = $props();

  let search: HTMLInputElement | undefined = $state();
  let filtersOpen = $state(false);
  let tagsGroup: HTMLElement | undefined = $state();
  let copied = $state('');

  const { filters } = $derived(snapshot);
  const tags = $derived(tagCounts(snapshot.beans));
  const groups = $derived([
    ['status', 'statuses', project.vocabulary.statuses],
    ['type', 'types', project.vocabulary.types],
    ['priority', 'priorities', project.vocabulary.priorities],
  ] as const);
  const activeCount = $derived(filters.statuses.length + filters.types.length + filters.priorities.length + filters.tags.length);

  const toggle = (list: readonly string[], value: string): string[] => (list.includes(value) ? list.filter((one) => one !== value) : [...list, value]);

  export function focusSearch(): void {
    search?.focus();
    search?.select();
  }

  /** The tag filter lives in the collapsible filters, so open it first. */
  export function focusTags(): void {
    filtersOpen = true;
    requestAnimationFrame(() => tagsGroup?.querySelector<HTMLElement>('button')?.focus());
  }

  /** The explicit selection, or the inspected bean when nothing is selected. Full stable IDs, one per line. */
  export async function copy(ids?: readonly string[]): Promise<void> {
    const target = ids ?? (snapshot.selection.ids.length > 0 ? snapshot.selection.ids : snapshot.selectedId === null ? [] : [snapshot.selectedId]);
    if (target.length === 0) return;
    try {
      await navigator.clipboard.writeText(target.join('\n'));
      copied = t('copy.done', { count: target.length });
    } catch {
      copied = t('copy.failed');
    }
  }

  const onSearchKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (filters.search === '') (event.currentTarget as HTMLElement).blur();
    else project.setFilters({ search: '' });
  };
</script>

<div class="controls">
  <div class="line" role="group" aria-label={t('view.label')}>
    {#each ['list', 'board'] as const as one (one)}
      <button type="button" aria-pressed={view === one} onclick={() => { onPrefs({ view: one }); }}>{t(`view.${one}`)}</button>
    {/each}
    {#if view === 'board'}
      <label>
        <input type="checkbox" checked={swimlanes === 'parent'} onchange={(event) => { onPrefs({ swimlanes: event.currentTarget.checked ? 'parent' : 'none' }); }} />
        {t('board.swimlanes')}
      </label>
    {/if}
  </div>
  <div class="line">
    <input
      bind:this={search}
      type="search"
      class="search"
      placeholder={t('list.search.placeholder')}
      aria-label={t('list.search')}
      value={filters.search}
      oninput={(event) => { project.setFilters({ search: event.currentTarget.value }); }}
      onkeydown={onSearchKey}
    />
    <button type="button" disabled={filters.search === ''} onclick={() => { project.setFilters({ search: '' }); search?.focus(); }}>{t('list.search.clear')}</button>
    <button type="button" onclick={onReset}>{t('list.reset')}</button>
  </div>

  <details class="filters" bind:open={filtersOpen}>
    <summary>{activeCount > 0 ? t('list.filters.active', { count: activeCount }) : t('list.filters')}</summary>
    {#each groups as [label, field, values] (field)}
      <div class="group" role="group" aria-label={t(`filter.${label}`)}>
        <span class="label">{t(`filter.${label}`)}</span>
        {#each values as value (value)}
          <button type="button" class="chip" aria-pressed={filters[field].includes(value)} onclick={() => { project.setFilters({ [field]: toggle(filters[field], value) }); }}>{value}</button>
        {/each}
      </div>
    {/each}
    <div class="group" role="group" aria-label={t('filter.tags')} bind:this={tagsGroup}>
      <span class="label">{t('filter.tags')}</span>
      {#each tags as [tag, count] (tag)}
        <button type="button" class="chip" aria-pressed={filters.tags.includes(tag)} onclick={() => { project.setFilters({ tags: toggle(filters.tags, tag) }); }}>{tag} <span class="count">{count}</span></button>
      {:else}
        <span class="none">{t('list.noTags')}</span>
      {/each}
    </div>
  </details>

  <div class="line">
    <span class="matches" role="status">{t('list.matches', { count: snapshot.visible.length, total: snapshot.beans.length })}</span>
    <span class="spacer"></span>
    <label>
      {t('list.sort')}
      <select value={sort.key} onchange={(event) => { onPrefs({ sort: { ...sort, key: event.currentTarget.value as SortKey } }); }}>
        {#each SORT_KEYS as key (key)}<option value={key}>{t(`sort.${key}` satisfies MessageKey)}</option>{/each}
      </select>
    </label>
    <button type="button" aria-pressed={sort.descending} onclick={() => { onPrefs({ sort: { ...sort, descending: !sort.descending } }); }}>{t('list.sort.descending')}</button>
    {#if view === 'list'}
    <details class="columns">
      <summary>{t('list.columns')}</summary>
      <div class="menu">
        {#each COLUMN_IDS as id (id)}
          <label>
            <input
              type="checkbox"
              checked={columns.includes(id)}
              onchange={(event) => { onPrefs({ columns: COLUMN_IDS.filter((one) => (one === id ? event.currentTarget.checked : columns.includes(one))) }); }}
            />
            {t(`column.${id}`)}
          </label>
        {/each}
      </div>
    </details>
    {/if}
  </div>

  <div class="line selection">
    <span role="status">
      {t('selection.count', { count: snapshot.selection.ids.length })}{snapshot.selection.hidden > 0 ? ` ${t('selection.hidden', { hidden: snapshot.selection.hidden })}` : ''}
    </span>
    <button type="button" disabled={snapshot.visible.length === 0} onclick={() => { project.selectVisible(); }}>{t('selection.all')}</button>
    <button type="button" disabled={snapshot.selection.ids.length === 0} onclick={() => { project.clearSelection(); }}>{t('selection.clear')}</button>
    <button type="button" disabled={snapshot.selectedId === null} onclick={() => void copy(snapshot.selectedId === null ? [] : [snapshot.selectedId])}>{t('copy.current')}</button>
    <button type="button" disabled={snapshot.selection.ids.length === 0} onclick={() => void copy(snapshot.selection.ids)}>{t('copy.selected')}</button>
    <span role="status" class="copied">{copied}</span>
  </div>
</div>

<style>
  .controls { display: flex; flex-direction: column; gap: var(--size-4-2); padding: var(--size-4-2) var(--size-4-3); border-bottom: 1px solid var(--background-modifier-border); }
  .line { display: flex; flex-wrap: wrap; gap: var(--size-4-2); align-items: center; }
  .search { flex: 1; min-width: 8rem; }
  .spacer { flex: 1; }
  .matches, .copied, .none, .label, .count { color: var(--text-muted); font-size: var(--font-ui-smaller); }
  .filters summary, .columns summary { cursor: pointer; font-size: var(--font-ui-small); }
  .group { display: flex; flex-wrap: wrap; gap: var(--size-4-1); align-items: center; margin-top: var(--size-4-2); max-height: 7rem; overflow-y: auto; }
  .label { min-width: 4.5rem; }
  .chip { height: auto; padding: 0 var(--size-4-2); font-size: var(--font-ui-smaller); }
  .chip[aria-pressed='true'], .line button[aria-pressed='true'] { background: var(--interactive-accent); color: var(--text-on-accent); }
  .columns { position: relative; }
  .menu { position: absolute; inset-inline-end: 0; z-index: 1; display: flex; flex-direction: column; padding: var(--size-4-2); background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); }
</style>
