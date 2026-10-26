<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { popTrail, pushTrail } from '../state/navigation.ts';
  import { follow } from './follow.svelte.ts';
  import type { WorkspaceHost } from './host.ts';
  import { t } from './i18n.ts';
  import Inspector from './Inspector.svelte';
  import StatusBar from './StatusBar.svelte';

  interface Props {
    host: WorkspaceHost;
    /** The bean this tab was opened for. Links inside the tab move on from here without changing the tab's identity. */
    id: string;
    onClose: () => void;
  }
  let { host, id, onClose }: Props = $props();

  const followed = untrack(() => follow(host));
  onDestroy(followed.stop);

  let shown = $state(untrack(() => id));
  let trail = $state<readonly string[]>([]);

  function openLink(next: string): void {
    trail = pushTrail(trail, shown);
    shown = next;
  }

  function goBack(): void {
    const previous = popTrail(trail);
    if (previous) {
      trail = previous.trail;
      shown = previous.id;
    }
  }
</script>

<section class="obsibeans-issue" class:compact={followed.density === 'compact'} aria-label={t('issue.label', { id })}>
  <header class="toolbar">
    <span class="spacer"></span>
    {#if followed.state}
      <button type="button" disabled={followed.snapshot?.refreshing ?? false} onclick={() => void followed.state?.refresh()}>{t('action.refresh')}</button>
    {/if}
    <button type="button" onclick={onClose}>{t('action.close')}</button>
  </header>
  {#if !followed.state || !followed.snapshot}
    <p class="unbound" role="status">{followed.bindingText} {t('workspace.hint')}</p>
  {:else}
    <Inspector snapshot={followed.snapshot} id={shown} onOpen={openLink} onBack={trail.length > 0 ? goBack : undefined} />
    <StatusBar project={followed.state} snapshot={followed.snapshot} />
  {/if}
</section>

<style>
  .obsibeans-issue { display: flex; flex-direction: column; height: 100%; }
  .toolbar { display: flex; gap: var(--size-4-2); padding: var(--size-4-2) var(--size-4-3); border-bottom: 1px solid var(--background-modifier-border); }
  .spacer { flex: 1; }
  .unbound { padding: var(--size-4-4); color: var(--text-muted); }
  :global(.obsibeans-issue .inspector) { flex: 1; }
</style>
