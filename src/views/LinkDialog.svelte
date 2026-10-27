<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { follow } from './follow.svelte.ts';
  import type { InsertOutcome, NoteTarget, WorkspaceHost } from './host.ts';
  import { t } from './i18n.ts';
  import BeanPicker from './BeanPicker.svelte';
  import InsertFailed from './InsertFailed.svelte';

  interface Props {
    host: WorkspaceHost;
    target: NoteTarget;
    onClose: () => void;
  }
  let { host, target, onClose }: Props = $props();

  const followed = untrack(() => follow(host));
  onDestroy(followed.stop);
  const snapshot = $derived(followed.snapshot);

  /** The bean being linked once the user chose it, and why the note was not written. */
  let chosen = $state<{ id: string; title: string } | undefined>();
  let failure = $state<Exclude<InsertOutcome, 'inserted'> | undefined>();

  function insert(id: string, title: string): void {
    chosen = { id, title };
    const outcome = target.insert(id, title, 'after');
    if (outcome === 'inserted') onClose();
    else failure = outcome;
  }
</script>

<section class="dialog" aria-labelledby="link-heading">
  <h2 id="link-heading">{t('link.title')}</h2>
  {#if !snapshot}
    <p role="status">{t('note.noProject', { binding: followed.bindingText })}</p>
    <button type="button" onclick={onClose}>{t('note.close')}</button>
  {:else if chosen && failure}
    <InsertFailed reason={failure} link={target.link(chosen.id, chosen.title)} onRetry={() => { if (chosen) insert(chosen.id, chosen.title); }} />
    <button type="button" onclick={onClose}>{t('note.close')}</button>
  {:else}
    <p class="intro">{t('link.intro', { note: target.notePath })}</p>
    <BeanPicker label={t('link.pick')} candidates={snapshot.beans} onPick={(id) => { insert(id, snapshot.beans.find((one) => one.id === id)?.title ?? ''); }} onCancel={onClose} />
  {/if}
</section>

<style>
  h2 { margin: 0 0 var(--size-4-3); }
  .intro { margin: 0 0 var(--size-4-2); color: var(--text-muted); font-size: var(--font-ui-small); }
</style>
