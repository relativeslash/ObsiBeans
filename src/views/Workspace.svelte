<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { navFilters, popTrail, pushTrail, type NavId } from '../state/navigation.ts';
  import CreateForm from './CreateForm.svelte';
  import { follow } from './follow.svelte.ts';
  import type { WorkspaceHost } from './host.ts';
  import { icon } from './icon.ts';
  import { t } from './i18n.ts';
  import Inspector from './Inspector.svelte';
  import { clampWidth, INSPECTOR_MAX, INSPECTOR_MIN, type Layout } from './layout.ts';
  import Navigation from './Navigation.svelte';
  import StatusBar from './StatusBar.svelte';
  import WorkList from './WorkList.svelte';

  /** Below this width the panes stack: one of views, list or details at a time. */
  const NARROW_PX = 760;
  const KEY_STEP = 16;

  interface Props {
    host: WorkspaceHost;
    layout: Layout;
    onLayout: (layout: Layout) => void;
    onClose: () => void;
  }
  let { host, layout, onLayout, onClose }: Props = $props();

  const followed = untrack(() => follow(host));
  onDestroy(followed.stop);

  let current = $state(untrack(() => layout));
  let width = $state(0);
  let trail = $state<readonly string[]>([]);
  let navOpen = $state(false);
  let detailOpen = $state(false);
  let creating = $state(false);
  /** The parent a new-child action pre-fills; the toolbar and list actions leave it open. */
  let newChildOf = $state<string | undefined>();
  let dragging = $state<{ readonly startX: number; readonly startWidth: number } | undefined>();

  const narrow = $derived(width > 0 && width < NARROW_PX);
  const snapshot = $derived(followed.snapshot);
  const project = $derived(followed.state);
  const showDetails = $derived(narrow && (detailOpen || creating) && !navOpen);
  const showList = $derived(!narrow || (!navOpen && !detailOpen && !creating));

  // Read through a derived value: other layout changes (view, sort) replace `current` but must not reset the filters.
  const nav = $derived(current.nav);
  // The navigation entry is the filter. Re-apply it whenever it changes or a new project state replaces the old one.
  $effect(() => {
    project?.setFilters(navFilters(nav));
  });

  function commit(next: Layout): void {
    current = next;
    onLayout(next);
  }

  function selectNav(id: NavId): void {
    navOpen = false;
    detailOpen = false;
    creating = false;
    commit({ ...current, nav: id });
  }

  function startCreating(parent?: string): void {
    navOpen = false;
    newChildOf = parent;
    creating = true;
  }

  function created(id: string): void {
    creating = false;
    openRow(id);
  }

  function openRow(id: string): void {
    creating = false;
    trail = [];
    project?.select(id);
    detailOpen = true;
  }

  function openLink(id: string): void {
    trail = pushTrail(trail, snapshot?.selectedId ?? null);
    project?.select(id);
  }

  function goBack(): void {
    const previous = popTrail(trail);
    if (previous) {
      trail = previous.trail;
      project?.select(previous.id);
    } else detailOpen = false;
  }

  function startDrag(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = { startX: event.clientX, startWidth: current.inspectorWidth };
  }

  function drag(event: PointerEvent): void {
    // The inspector is on the right, so dragging left makes it wider.
    if (dragging) current = { ...current, inspectorWidth: clampWidth(dragging.startWidth + dragging.startX - event.clientX) };
  }

  function endDrag(): void {
    if (dragging) onLayout(current);
    dragging = undefined;
  }

  function resizeKey(event: KeyboardEvent): void {
    const delta = event.key === 'ArrowLeft' ? KEY_STEP : event.key === 'ArrowRight' ? -KEY_STEP : 0;
    if (delta === 0) return;
    event.preventDefault();
    commit({ ...current, inspectorWidth: clampWidth(current.inspectorWidth + delta) });
  }
</script>

<section
  class="obsibeans-workspace"
  class:compact={followed.density === 'compact'}
  class:narrow
  aria-label={t('workspace.label')}
  bind:clientWidth={width}
  style:--inspector-width="{current.inspectorWidth}px"
>
  <header class="toolbar">
    <h1>{t('workspace.title')}</h1>
    {#if narrow}
      <button type="button" aria-expanded={navOpen} onclick={() => { navOpen = !navOpen; }}>
        <span use:icon={'menu'}></span> {t('action.views')}
      </button>
    {/if}
    <span class="spacer"></span>
    {#if project}
      <button type="button" onclick={() => { startCreating(); }}><span use:icon={'plus'}></span> {t('create.open')}</button>
      <button type="button" disabled={snapshot?.refreshing ?? false} onclick={() => void project.refresh()}>
        <span use:icon={'refresh-cw'}></span> {t('action.refresh')}
      </button>
    {/if}
    <button type="button" onclick={onClose}><span use:icon={'x'}></span> {t('action.close')}</button>
  </header>

  {#if !project || !snapshot}
    <p class="unbound" role="status">{followed.bindingText} {t('workspace.hint')}</p>
  {:else}
    <div class="panes">
      {#if !narrow || navOpen}
        <div class="pane-nav"><Navigation active={current.nav} onSelect={selectNav} /></div>
      {/if}
      <div class="pane-list" hidden={!showList}>
        <WorkList
          {project}
          {snapshot}
          active={showList}
          columns={current.columns}
          sort={current.sort}
          view={current.view}
          swimlanes={current.swimlanes}
          onPrefs={(patch) => { commit({ ...current, ...patch }); }}
          onOpen={openRow}
          onShowAll={() => { selectNav('all'); }}
          onCreate={() => { startCreating(); }}
          onNewChild={startCreating}
          onReset={() => { project.setFilters(navFilters(current.nav)); }}
        />
      </div>
      {#if !narrow}
        <!-- A focusable separator is a standard window splitter (WAI-ARIA APG). -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <div
          class="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('inspector.resize')}
          aria-valuemin={INSPECTOR_MIN}
          aria-valuemax={INSPECTOR_MAX}
          aria-valuenow={current.inspectorWidth}
          tabindex="0"
          onpointerdown={startDrag}
          onpointermove={drag}
          onpointerup={endDrag}
          onpointercancel={endDrag}
          onkeydown={resizeKey}
        ></div>
      {/if}
      {#if !narrow || showDetails}
        <div class="pane-detail">
          {#if creating}
            <CreateForm {project} {snapshot} parentId={newChildOf} onDone={created} onCancel={() => { creating = false; }} />
          {:else}
            <Inspector
              {host}
              {project}
              {snapshot}
              id={snapshot.selectedId}
              onOpen={openLink}
              onBack={narrow || trail.length > 0 ? goBack : undefined}
              onNewChild={startCreating}
              onOpenTab={snapshot.selectedId === null ? undefined : () => void host.openIssue(snapshot.selectedId ?? '')}
            />
          {/if}
        </div>
      {/if}
    </div>
    <StatusBar {project} {snapshot} />
  {/if}
</section>

<style>
  .obsibeans-workspace { display: flex; flex-direction: column; height: 100%; --row-padding: var(--size-4-2); }
  .obsibeans-workspace.compact { --row-padding: var(--size-4-1); }
  .toolbar { display: flex; gap: var(--size-4-2); align-items: center; padding: var(--size-4-2) var(--size-4-3); border-bottom: 1px solid var(--background-modifier-border); }
  .toolbar button { display: inline-flex; gap: var(--size-4-1); align-items: center; }
  .toolbar h1 { margin: 0; font-size: var(--font-ui-large); }
  .spacer { flex: 1; }
  .unbound { padding: var(--size-4-4); color: var(--text-muted); }
  .panes { display: grid; flex: 1; min-height: 0; grid-template-columns: 11rem minmax(0, 1fr) 6px var(--inspector-width); }
  .narrow .panes { grid-template-columns: minmax(0, 1fr); }
  .panes > * { min-height: 0; min-width: 0; }
  .pane-nav { border-inline-end: 1px solid var(--background-modifier-border); }
  .narrow .pane-nav { border: 0; }
  .pane-list[hidden] { display: none; }
  .splitter { cursor: col-resize; background: var(--background-modifier-border); }
  .splitter:hover, .splitter:focus-visible { background: var(--interactive-accent); }
</style>
