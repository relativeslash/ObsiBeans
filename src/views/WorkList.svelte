<script lang="ts">
  import { tick } from 'svelte';
  import { listRows } from '../state/filters.ts';
  import type { BeanSummary, Change, Snapshot } from '../state/model.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import { describeError } from './errors.ts';
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
    onPrefs: (patch: Partial<Pick<Layout, 'columns' | 'sort'>>) => void;
    onOpen: (id: string) => void;
    onShowAll: () => void;
    /** Back to the filters of the current navigation entry. */
    onReset: () => void;
  }
  let { project, snapshot, active, columns, sort, onPrefs, onOpen, onShowAll, onReset }: Props = $props();

  const VIEW = 'workspace-list';
  let scroller: HTMLElement | undefined = $state();
  let controls: ListControls | undefined = $state();
  let wasActive = true;
  let pendingG = false;

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

  async function edit(event: Event, bean: BeanSummary, field: Field): Promise<void> {
    const select = event.currentTarget as HTMLSelectElement;
    const change = { kind: 'fields', [field]: select.value } as Change;
    attempts.set(bean.id, change);
    await project.mutate(bean.id, change);
    // Unsaved means the cached value stands, so the picker must not keep showing the choice.
    select.value = project.getSnapshot().beans.find((one) => one.id === bean.id)?.[field] ?? select.value;
  }

  const overwrite = (id: string, revision: string, change: Change): void => {
    void project.mutate(id, change, revision);
  };

  const isText = (target: HTMLElement): boolean => target.matches('input:not([type="checkbox"]), select, textarea') || target.isContentEditable;

  /** Familiar bindings (design: TUI parity), active only outside text fields. Every one has a visible control too. */
  function onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') {
      if (snapshot.selection.ids.length > 0) {
        project.clearSelection();
        event.preventDefault();
      }
      return;
    }
    if (isText(target)) return;
    const armed = pendingG;
    pendingG = event.key === 'g';
    if (armed && event.key === 't') return void controls?.focusTags();
    if (event.key === '/') {
      event.preventDefault();
      return controls?.focusSearch();
    }
    if (event.key === 'y') return void controls?.copy();
    if (!target.matches('button.row')) return;
    const all = [...(scroller?.querySelectorAll<HTMLElement>('button.row') ?? [])];
    const at = all.indexOf(target);
    const move = (delta: number): void => {
      event.preventDefault();
      all[Math.min(all.length - 1, Math.max(0, at + delta))]?.focus();
    };
    if (event.key === 'j' || event.key === 'ArrowDown') move(1);
    else if (event.key === 'k' || event.key === 'ArrowUp') move(-1);
    else if (event.key === ' ') {
      if (target.dataset.context === undefined) project.toggleSelected(target.dataset.id ?? '');
      move(1);
    }
  }

  const remember = (focusId: string | null): void => {
    project.setViewState(VIEW, { scrollTop: scroller?.scrollTop ?? 0, focusId });
  };

  // A hidden element forgets its scroll position, so the saved one is put back when the list returns.
  $effect(() => {
    const returning = active && !wasActive;
    wasActive = active;
    if (!active || !scroller) return;
    const saved = project.getViewState(VIEW);
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
  <ListControls bind:this={controls} {project} {snapshot} {columns} {sort} {onPrefs} {onReset} />
{/if}
<div class="list" bind:this={scroller} onscroll={() => { remember(project.getViewState(VIEW)?.focusId ?? null); }}>
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
  .pane { display: flex; flex-direction: column; height: 100%; min-width: 0; }
  .list { flex: 1; overflow-y: auto; min-width: 0; min-height: 0; }
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
