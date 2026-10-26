<script lang="ts">
  import { tick } from 'svelte';
  import type { Snapshot } from '../state/model.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import { describeError } from './errors.ts';
  import { t } from './i18n.ts';

  interface Props {
    project: WorkspaceState;
    snapshot: Snapshot;
    /** False while another pane covers the list. The list stays mounted so nothing is lost. */
    active: boolean;
    onOpen: (id: string) => void;
    onShowAll: () => void;
  }
  let { project, snapshot, active, onOpen, onShowAll }: Props = $props();

  const VIEW = 'workspace-list';
  let scroller: HTMLElement | undefined = $state();
  let wasActive = true;

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
      {#each snapshot.visible as bean (bean.path)}
        <li>
          <button
            type="button"
            class="row"
            data-id={bean.id}
            aria-current={snapshot.selectedId === bean.id ? 'true' : undefined}
            onfocus={() => { remember(bean.id); }}
            onclick={() => { onOpen(bean.id); }}
          >
            <span class="id">{bean.id}</span>
            <span class="title">{bean.title}</span>
            <span class="badge">{bean.status}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .list { overflow-y: auto; min-width: 0; height: 100%; }
  .rows, .message ul { margin: 0; padding: 0; list-style: none; }
  .message { padding: var(--size-4-4); color: var(--text-muted); }
  .banner { display: flex; gap: var(--size-4-2); align-items: center; justify-content: space-between; margin: var(--size-4-2); padding: var(--size-4-2) var(--size-4-3); border-radius: var(--radius-s); background: var(--background-modifier-message); }
  .row { display: flex; width: 100%; gap: var(--size-4-3); align-items: baseline; justify-content: flex-start; height: auto; padding: var(--row-padding, var(--size-4-2)) var(--size-4-3); text-align: start; background: transparent; box-shadow: none; border-radius: 0; color: var(--text-normal); }
  .row:hover { background: var(--background-modifier-hover); }
  .row[aria-current='true'] { background: var(--background-modifier-active-hover); box-shadow: inset 3px 0 0 var(--interactive-accent); }
  .id { font-family: var(--font-monospace); font-size: var(--font-ui-smaller); color: var(--text-muted); white-space: nowrap; }
  .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { font-size: var(--font-ui-smaller); padding: 0 var(--size-4-2); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); color: var(--text-muted); white-space: nowrap; }
</style>
