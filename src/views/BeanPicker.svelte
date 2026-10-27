<script lang="ts">
  import { onMount } from 'svelte';
  import { matchesFilters } from '../state/filters.ts';
  import { DEFAULT_FILTERS, type BeanSummary } from '../state/model.ts';
  import { t } from './i18n.ts';

  interface Props {
    /** Names the picker for assistive technology and heads it. */
    label: string;
    candidates: readonly BeanSummary[];
    /** The bean that is chosen now, or null for "none"; it is marked. */
    current?: string | null;
    /** Offers a first entry that picks nothing, such as "No parent". */
    noneLabel?: string;
    onPick: (id: string) => void;
    onNone?: () => void;
    onCancel: () => void;
  }
  let { label, candidates, current, noneLabel, onPick, onNone, onCancel }: Props = $props();

  /** Rows drawn at once; a longer list asks for a narrower search. */
  const LIMIT = 50;
  const NO_READINESS = { blocked: new Set<string>(), ready: new Set<string>() };

  let query = $state('');
  let input: HTMLInputElement | undefined = $state();
  const matches = $derived(candidates.filter((bean) => matchesFilters(bean, { ...DEFAULT_FILTERS, search: query }, NO_READINESS)));

  onMount(() => { input?.focus(); });

  /** Enter in the search field picks the first match. */
  function onSearchKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || !matches[0]) return;
    event.preventDefault();
    onPick(matches[0].id);
  }

  /** Escape from the field or the list closes the picker and nothing around it. */
  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  }
</script>

<!-- Escape bubbles from the field and the list; every action also has a visible button. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="picker" role="group" aria-label={label} onkeydown={onKey}>
  <p class="heading">{label}</p>
  <input type="search" aria-label={t('picker.search')} placeholder={t('picker.search')} bind:this={input} bind:value={query} onkeydown={onSearchKey} />
  <ul>
    {#if onNone && noneLabel}
      <li><button type="button" aria-current={current === null} onclick={onNone}>{noneLabel}</button></li>
    {/if}
    {#each matches.slice(0, LIMIT) as bean (bean.path)}
      <li>
        <button type="button" aria-current={bean.id === current} onclick={() => { onPick(bean.id); }}>
          <span class="id">{bean.id}</span> {bean.title} <span class="type">({bean.type})</span>
        </button>
      </li>
    {/each}
  </ul>
  {#if matches.length === 0}<p class="note" role="status">{t('picker.none')}</p>{/if}
  {#if matches.length > LIMIT}<p class="note">{t('picker.more', { count: matches.length - LIMIT })}</p>{/if}
  <button type="button" onclick={onCancel}>{t('picker.cancel')}</button>
</div>

<style>
  .picker { margin-block: var(--size-4-2); padding: var(--size-4-2); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-m); }
  .heading { margin: 0 0 var(--size-4-1); font-weight: var(--font-semibold); }
  input { width: 100%; margin-bottom: var(--size-4-2); }
  ul { margin: 0 0 var(--size-4-2); padding: 0; max-height: 14rem; overflow-y: auto; list-style: none; }
  li button { width: 100%; height: auto; padding: var(--size-4-1) var(--size-4-2); background: transparent; box-shadow: none; text-align: start; }
  li button:hover, li button:focus-visible { background: var(--background-modifier-hover); }
  li button[aria-current='true'] { font-weight: var(--font-semibold); }
  li button[aria-current='true']::after { content: ' ✓'; }
  .id { font-family: var(--font-monospace); font-size: var(--font-ui-smaller); color: var(--text-muted); }
  .type, .note { color: var(--text-muted); font-size: var(--font-ui-smaller); }
  .note { margin: 0 0 var(--size-4-2); }
</style>
