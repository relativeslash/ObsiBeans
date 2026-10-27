<script lang="ts">
  import { blockersByBean, hierarchyRows, progressByBean } from '../state/hierarchy.ts';
  import type { Snapshot } from '../state/model.ts';
  import { canHaveChildren } from '../state/relations.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import { t } from './i18n.ts';
  import { icon } from './icon.ts';
  import type { Layout } from './layout.ts';

  interface Props {
    project: WorkspaceState;
    snapshot: Snapshot;
    sort: Layout['sort'];
    /** The user's open/closed choices by full bean ID. A parent without a choice follows the filters (see `hierarchyRows`). */
    expanded: ReadonlyMap<string, boolean>;
    onOpen: (id: string) => void;
    /** Opens the creation form with the parent filled in. */
    onNewChild?: ((parentId: string) => void) | undefined;
    /** Remembers the focused row, like the list does. */
    onFocus: (id: string) => void;
  }
  let { project, snapshot, sort, expanded = $bindable(), onOpen, onNewChild, onFocus }: Props = $props();

  const rows = $derived(hierarchyRows(snapshot.beans, snapshot.visible, sort, project.vocabulary, expanded));
  const progress = $derived(progressByBean(snapshot.beans));
  const blockers = $derived(blockersByBean(snapshot.beans));
  const selected = $derived(new Set(snapshot.selection.ids));
  const parents = $derived([...new Set(snapshot.beans.flatMap((bean) => (bean.parentId === null ? [] : [bean.parentId])))]);

  const set = (id: string, open: boolean): void => {
    expanded = new Map(expanded).set(id, open);
  };
  const setAll = (open: boolean): void => {
    expanded = new Map(parents.map((id) => [id, open]));
  };

  /** Arrow keys on a focused row, as in a tree: Right opens or enters, Left closes or goes to the parent. */
  function onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || !target.matches('button.row')) return;
    const at = rows.findIndex((row) => row.bean.id === target.dataset.id);
    const row = rows[at];
    if (!row || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
    event.preventDefault();
    const focus = (index: number): void => {
      const id = rows[index]?.bean.id;
      if (id !== undefined) [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button.row')].find((one) => one.dataset.id === id)?.focus();
    };
    if (event.key === 'ArrowRight') {
      if (row.children === 0) return;
      if (row.expanded) focus(at + 1);
      else set(row.bean.id, true);
    } else if (row.expanded) set(row.bean.id, false);
    else focus(rows.slice(0, at).map((one) => one.depth).lastIndexOf(row.depth - 1));
  }
</script>

<div class="bar">
  <button type="button" disabled={parents.length === 0} onclick={() => { setAll(true); }}>{t('hierarchy.expandAll')}</button>
  <button type="button" disabled={parents.length === 0} onclick={() => { setAll(false); }}>{t('hierarchy.collapseAll')}</button>
  <span class="rule">{t('hierarchy.rule')}</span>
</div>
<!-- Arrow keys bubble from the focused row; every row also has visible expand and open controls. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<ul class="rows" aria-label={t('hierarchy.label')} onkeydown={onKey}>
  <!-- Keyed by file: two files can claim one ID, and a duplicate key would stop the whole view from rendering. -->
  {#each rows as { bean, depth, context, children, expanded: open, problem } (bean.path)}
    {@const sums = progress.get(bean.id)}
    {@const waiting = blockers.get(bean.id)}
    <li class="item" class:context style:--depth={depth}>
      {#if children > 0}
        <button type="button" class="twisty" aria-expanded={open} aria-label={t(open ? 'hierarchy.collapse' : 'hierarchy.expand', { id: bean.id })} onclick={() => { set(bean.id, !open); }}>
          <span use:icon={open ? 'chevron-down' : 'chevron-right'}></span>
        </button>
      {:else}
        <span class="twisty"></span>
      {/if}
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
        onfocus={() => { onFocus(bean.id); }}
        onclick={() => { onOpen(bean.id); }}
      >
        <span class="id">{bean.id}</span>
        <span class="title">{bean.title}</span>
        {#if context}<span class="badge">{t('list.context')}</span>{/if}
      </button>
      <span class="cell">{bean.type}</span>
      <span class="cell">{bean.status}</span>
      {#if onNewChild && canHaveChildren(bean.type)}
        <button type="button" class="child" aria-label={t('hierarchy.newChild', { id: bean.id })} onclick={() => { onNewChild(bean.id); }}>{t('children.new')}</button>
      {/if}
      {#if sums || waiting || problem || canHaveChildren(bean.type)}
        <span class="detail">
          {#if sums?.kind === 'counted'}
            <span class="progress">{t('hierarchy.progress', { percent: sums.percent, completed: sums.completed, scrapped: sums.scrapped, open: sums.open })}</span>
          {:else if sums?.kind === 'all-scrapped'}
            <span class="progress">{t('hierarchy.allScrapped', { scrapped: sums.scrapped })}</span>
          {:else if canHaveChildren(bean.type)}
            <!-- A container with no children, or only loop members below it, has no leaves to count. -->
            <span class="progress">{t('hierarchy.none')}</span>
          {/if}
          {#if waiting}
            <span class="warn" title={waiting.loop ? t('hierarchy.blockedLoop') : undefined}>{t('hierarchy.blockedBy', { ids: waiting.ids.join(', ') })}{waiting.loop ? ` ${t('hierarchy.blockedLoop')}` : ''}</span>
          {/if}
          {#if problem}
            <span class="warn" role="alert">{problem.kind === 'loop' ? t('hierarchy.parentLoop') : t('hierarchy.missingParent', { id: problem.id })}</span>
          {/if}
        </span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .bar { display: flex; flex-wrap: wrap; gap: var(--size-4-2); align-items: center; padding: var(--size-4-2) var(--size-4-3); }
  .rule { flex-basis: 100%; font-size: var(--font-ui-smaller); color: var(--text-muted); }
  .rows { margin: 0; padding: 0; list-style: none; }
  /* Off-screen rows are skipped by the browser, which keeps long trees cheap without a virtual list. */
  .item { display: flex; flex-wrap: wrap; gap: var(--size-4-2); align-items: center; padding-inline: var(--size-4-3); padding-inline-start: calc(var(--size-4-3) + var(--depth) * var(--size-4-4)); content-visibility: auto; contain-intrinsic-size: auto 2.5rem; }
  .item:hover { background: var(--background-modifier-hover); }
  .item.context { color: var(--text-muted); font-style: italic; }
  .twisty { display: inline-flex; width: 1.5rem; flex: none; align-items: center; justify-content: center; padding: 0; background: transparent; box-shadow: none; }
  .check { width: 1rem; flex: none; }
  .row { display: flex; flex: 1; min-width: 6rem; gap: var(--size-4-3); align-items: baseline; justify-content: flex-start; height: auto; padding: var(--row-padding, var(--size-4-2)) var(--size-4-2); text-align: start; background: transparent; box-shadow: none; border-radius: 0; color: inherit; }
  .row[aria-current='true'] { background: var(--background-modifier-active-hover); box-shadow: inset 3px 0 0 var(--interactive-accent); }
  .id { font-family: var(--font-monospace); font-size: var(--font-ui-smaller); color: var(--text-muted); white-space: nowrap; }
  .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { font-size: var(--font-ui-smaller); padding: 0 var(--size-4-2); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); color: var(--text-muted); white-space: nowrap; }
  .cell { font-size: var(--font-ui-smaller); color: var(--text-muted); white-space: nowrap; }
  .child { font-size: var(--font-ui-smaller); height: auto; }
  .detail { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: var(--size-4-3); padding-inline-start: 3rem; font-size: var(--font-ui-smaller); color: var(--text-muted); }
  .warn { color: var(--text-error); }
</style>
