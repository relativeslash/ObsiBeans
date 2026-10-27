<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { navFilters } from '../state/navigation.ts';
  import { describeError } from './errors.ts';
  import { follow } from './follow.svelte.ts';
  import type { WorkspaceHost } from './host.ts';
  import { t } from './i18n.ts';
  import StatusBar from './StatusBar.svelte';

  interface Props {
    host: WorkspaceHost;
  }
  let { host }: Props = $props();

  const followed = untrack(() => follow(host));
  onDestroy(followed.stop);

  const snapshot = $derived(followed.snapshot);
  const project = $derived(followed.state);
  // The workspace's own definitions of Ready and In progress (backend readiness), whatever its list currently filters.
  const groups = $derived.by(() => {
    void snapshot;
    return (['ready', 'in-progress'] as const).map((id) => ({ id, beans: project?.matching(navFilters(id)) ?? [] }));
  });
  const broken = $derived(snapshot?.status === 'disconnected' || snapshot?.status === 'invalid-data');
</script>

<section class="sidebar" class:compact={followed.density === 'compact'} aria-label={t('sidebar.label')}>
  {#if !project || !snapshot}
    <p class="message" role="status">{followed.bindingText} {t('workspace.hint')}</p>
  {:else}
    {#if snapshot.stale}
      <div class="banner" role="alert">
        <span>{t('list.stale', { time: snapshot.refreshedAt === null ? '' : new Date(snapshot.refreshedAt).toLocaleTimeString('en') })}{snapshot.failure ? ` ${describeError(snapshot.failure)}` : ''}</span>
        <button type="button" disabled={snapshot.refreshing} onclick={() => void project.refresh()}>{t('action.refresh')}</button>
      </div>
    {/if}
    {#if snapshot.status === 'loading'}
      <p class="message" role="status">{t('list.loading')}</p>
    {:else if broken}
      <div class="message" role="alert">
        <p>{snapshot.failure ? describeError(snapshot.failure) : t(`list.${snapshot.status as 'disconnected' | 'invalid-data'}`)}</p>
        <button type="button" disabled={snapshot.refreshing} onclick={() => void project.refresh()}>{t('action.retry')}</button>
      </div>
    {:else if snapshot.status === 'empty'}
      <p class="message" role="status">{t('list.empty')}</p>
    {:else}
      {#each groups as group (group.id)}
        <h2 id="sidebar-{group.id}">{t(`nav.${group.id}`)} <span class="count">{group.beans.length}</span></h2>
        <ul aria-labelledby="sidebar-{group.id}">
          <!-- Keyed by file: two files can claim one ID. -->
          {#each group.beans as bean (bean.path)}
            <li>
              <button type="button" class="row" data-id={bean.id} title={bean.title} onclick={() => void host.openIssue(bean.id)}>
                <span class="id">{bean.id}</span>
                <span class="title">{bean.title}</span>
              </button>
            </li>
          {:else}
            <li class="message">{t('sidebar.none')}</li>
          {/each}
        </ul>
      {/each}
    {/if}
    <StatusBar {project} {snapshot} />
  {/if}
</section>

<style>
  .sidebar { display: flex; flex-direction: column; height: 100%; overflow-y: auto; --row-padding: var(--size-4-1); }
  .sidebar.compact { --row-padding: 0; }
  h2 { margin: var(--size-4-3) var(--size-4-3) var(--size-4-1); font-size: var(--font-ui-small); font-weight: var(--font-semibold); }
  .count, .id { color: var(--text-muted); font-size: var(--font-ui-smaller); }
  ul { margin: 0; padding: 0; list-style: none; }
  .message { padding: var(--size-4-2) var(--size-4-3); color: var(--text-muted); }
  .banner { display: flex; gap: var(--size-4-2); align-items: center; justify-content: space-between; margin: var(--size-4-2); padding: var(--size-4-2) var(--size-4-3); border-radius: var(--radius-s); background: var(--background-modifier-message); }
  .row { display: flex; width: 100%; gap: var(--size-4-2); align-items: baseline; justify-content: flex-start; height: auto; padding: var(--row-padding) var(--size-4-3); text-align: start; background: transparent; box-shadow: none; color: inherit; }
  .row:hover { background: var(--background-modifier-hover); }
  .id { font-family: var(--font-monospace); white-space: nowrap; }
  .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* StatusBar sits at the bottom of the pane. */
  .sidebar :global(.status) { margin-top: auto; }
</style>
