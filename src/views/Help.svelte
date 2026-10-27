<script lang="ts">
  import { onMount } from 'svelte';
  import { DETAIL_KEYS, LIST_KEYS, type ActionId } from './actions.ts';
  import { t, type MessageKey } from './i18n.ts';

  interface Props {
    /** An issue tab has no list, so it shows only the inspector's keys. */
    scope: 'list' | 'detail';
    onClose: () => void;
  }
  let { scope, onClose }: Props = $props();

  const label = (action: ActionId): string => t(`command.${action}`);
  /** Keys for one table, in table order. Generated from the tables the key handlers use, so help matches what works. */
  const rows = (keys: Readonly<Record<string, ActionId>>): (readonly [string, string])[] => Object.entries(keys).filter(([, action]) => action !== 'help').map(([key, action]) => [key, label(action)]);
  const fixed = (...pairs: (readonly [string, MessageKey])[]): (readonly [string, string])[] => pairs.map(([keys, key]) => [keys, t(key)]);

  const sections = $derived([
    ...(scope === 'list'
      ? [
          { title: t('help.list'), rows: [...fixed(['↑ ↓ j k', 'help.move'], ['Home End', 'help.ends'], ['Page Up, Page Down', 'help.page'], ['Space', 'help.select'], ['← →', 'help.tree']), ...rows(LIST_KEYS), ['g t', label('tags')]] },
        ]
      : []),
    { title: t('help.detail'), rows: rows(DETAIL_KEYS) },
    { title: t('help.anywhere'), rows: [['?', label('help')], ...fixed(['Escape', 'help.escape'])] },
  ]);

  let panel: HTMLElement | undefined = $state();
  let close: HTMLButtonElement | undefined = $state();

  // Focus goes into the dialog and comes back to where it was, so keyboard users keep their place.
  onMount(() => {
    const before = document.activeElement;
    panel?.focus();
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  });

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === '?') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Tab') {
      // The one control is Close; keep focus in the dialog.
      event.preventDefault();
      (document.activeElement === close ? panel : close)?.focus();
    }
  }
</script>

<!-- A modal layer inside the view: Escape and ? close it, and Tab stays within it. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="help-heading" tabindex="-1" onkeydown={onKey}>
  <div class="panel" bind:this={panel} tabindex="-1">
    <h2 id="help-heading">{t('help.title')}</h2>
    {#each sections as section (section.title)}
      <h3>{section.title}</h3>
      <dl>
        {#each section.rows as [keys, text] (keys)}
          <dt><kbd>{keys}</kbd></dt>
          <dd>{text}</dd>
        {/each}
      </dl>
    {/each}
    <p class="note">{t('help.note')}</p>
    <button type="button" class="mod-cta" bind:this={close} onclick={onClose}>{t('action.close')}</button>
  </div>
</div>

<style>
  .backdrop { position: absolute; inset: 0; z-index: 10; display: flex; align-items: flex-start; justify-content: center; padding: var(--size-4-4); overflow-y: auto; background: var(--background-modifier-cover); }
  .panel { max-width: 36rem; width: 100%; padding: var(--size-4-4); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-m); background: var(--background-primary); }
  h2 { margin: 0 0 var(--size-4-2); }
  h3 { margin: var(--size-4-3) 0 var(--size-4-1); font-size: var(--font-ui-small); text-transform: uppercase; color: var(--text-muted); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--size-4-1) var(--size-4-3); margin: 0; }
  dd { margin: 0; }
  .note { color: var(--text-muted); font-size: var(--font-ui-smaller); }
</style>
