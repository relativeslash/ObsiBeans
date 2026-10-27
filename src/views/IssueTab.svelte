<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { ActionId, ActionPort } from './actions.ts';
  import { popTrail, pushTrail } from '../state/navigation.ts';
  import CreateForm from './CreateForm.svelte';
  import { follow } from './follow.svelte.ts';
  import Help from './Help.svelte';
  import type { WorkspaceHost } from './host.ts';
  import { t } from './i18n.ts';
  import Inspector from './Inspector.svelte';
  import StatusBar from './StatusBar.svelte';

  interface Props {
    host: WorkspaceHost;
    /** The bean this tab was opened for. Links inside the tab move on from here without changing the tab's identity. */
    id: string;
    onClose: () => void;
    /** Where the view offers its actions to palette commands while it is mounted. */
    port?: ActionPort | undefined;
  }
  let { host, id, onClose, port }: Props = $props();

  const followed = untrack(() => follow(host));
  onDestroy(followed.stop);

  let shown = $state(untrack(() => id));
  let trail = $state<readonly string[]>([]);
  /** The parent of the child being created in this tab; the form replaces the details until it ends. */
  let newChildOf = $state<string | undefined>();
  let helpOpen = $state(false);
  let inspector: Inspector | undefined = $state();

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

  $effect(() => {
    if (!port) return;
    const run = (action: ActionId): void => {
      if (action === 'help') helpOpen = true;
      else if (action === 'back') goBack();
      else inspector?.run(action);
    };
    port.run = run;
    return () => {
      if (port.run === run) port.run = undefined;
    };
  });
</script>

<section class="obsibeans-issue" class:compact={followed.density === 'compact'} aria-label={t('issue.label', { id })}>
  <header class="toolbar">
    <span class="spacer"></span>
    {#if followed.state}
      <button type="button" disabled={followed.snapshot?.refreshing ?? false} onclick={() => void followed.state?.refresh()}>{t('action.refresh')}</button>
      <button type="button" aria-haspopup="dialog" onclick={() => { helpOpen = true; }}>{t('action.help')}</button>
    {/if}
    <button type="button" onclick={onClose}>{t('action.close')}</button>
  </header>
  {#if !followed.state || !followed.snapshot}
    <p class="unbound" role="status">{followed.bindingText} {t('workspace.hint')}</p>
  {:else}
    {#if newChildOf !== undefined}
      <CreateForm
        project={followed.state}
        snapshot={followed.snapshot}
        parentId={newChildOf}
        onDone={(created) => { newChildOf = undefined; openLink(created); }}
        onCancel={() => { newChildOf = undefined; }}
      />
    {:else}
      <Inspector bind:this={inspector} onHelp={() => { helpOpen = true; }} {host} project={followed.state} snapshot={followed.snapshot} id={shown} onOpen={openLink} onBack={trail.length > 0 ? goBack : undefined} onNewChild={(parent) => { newChildOf = parent; }} />
    {/if}
    <StatusBar project={followed.state} snapshot={followed.snapshot} />
  {/if}
  {#if helpOpen}<Help scope="detail" onClose={() => { helpOpen = false; }} />{/if}
</section>

<style>
  .obsibeans-issue { position: relative; display: flex; flex-direction: column; height: 100%; }
  :global(.obsibeans-issue :is(button, summary):focus-visible) { outline: 2px solid var(--interactive-accent); outline-offset: -2px; }
  .toolbar { display: flex; flex-wrap: wrap; gap: var(--size-4-2); padding: var(--size-4-2) var(--size-4-3); border-bottom: 1px solid var(--background-modifier-border); }
  .spacer { flex: 1; }
  .unbound { padding: var(--size-4-4); color: var(--text-muted); }
  :global(.obsibeans-issue .inspector) { flex: 1; }
</style>
