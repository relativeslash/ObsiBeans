<script lang="ts">
  import type { Snapshot } from '../state/model.ts';
  import { relationsOf, type Related } from '../state/navigation.ts';
  import { t, type MessageKey } from './i18n.ts';

  interface Props {
    snapshot: Snapshot;
    /** The bean to show. */
    id: string | null;
    onOpen: (id: string) => void;
    /** Present when going back is possible. */
    onBack?: (() => void) | undefined;
    /** Present when the bean can still be opened in its own tab. */
    onOpenTab?: (() => void) | undefined;
  }
  let { snapshot, id, onOpen, onBack, onOpenTab }: Props = $props();

  const bean = $derived(snapshot.beans.find((one) => one.id === id));
  const relations = $derived(id === null ? undefined : relationsOf(snapshot.beans, id));
  const sections = $derived(
    relations
      ? ([
          ['inspector.parent', relations.parent ? [relations.parent] : []],
          ['inspector.children', relations.children],
          ['inspector.blockedBy', relations.blockedBy],
          ['inspector.blocks', relations.blocks],
        ] as const satisfies readonly (readonly [MessageKey, readonly Related[]])[])
      : [],
  );
</script>

<article class="inspector" aria-label={t('inspector.label')}>
  {#if onBack || onOpenTab}
    <div class="actions">
      {#if onBack}<button type="button" onclick={onBack}>{t('action.back')}</button>{/if}
      {#if onOpenTab}<button type="button" onclick={onOpenTab}>{t('action.openTab')}</button>{/if}
    </div>
  {/if}
  {#if id === null}
    <p class="empty">{t('inspector.none')}</p>
  {:else if !bean}
    <p class="empty" role="status">{snapshot.status === 'loading' ? t('list.loading') : t('inspector.gone', { id })}</p>
  {:else}
    <h2>{bean.title}</h2>
    <p class="id">{bean.id}</p>
    <ul class="facts" aria-label={t('inspector.fields')}>
      <li>{t('inspector.status', { value: bean.status })}</li>
      <li>{t('inspector.type', { value: bean.type })}</li>
      <li>{t('inspector.priority', { value: bean.priority })}</li>
    </ul>
    {#if bean.tags.length > 0}
      <ul class="tags" aria-label={t('inspector.tags')}>
        {#each bean.tags as tag, index (index)}<li>{tag}</li>{/each}
      </ul>
    {/if}
    {#each sections as [name, items] (name)}
      <section>
        <h3>{t(name)}</h3>
        {#if items.length === 0}
          <p class="empty">{t('inspector.noneRelated')}</p>
        {:else}
          <ul>
            {#each items as related (related.id)}
              <li>
                {#if related.bean}
                  <button type="button" class="link" onclick={() => { onOpen(related.id); }}>
                    <span class="id">{related.id}</span> {related.bean.title}
                  </button>
                {:else}
                  <span class="id">{t('inspector.missing', { id: related.id })}</span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}
  {/if}
</article>

<style>
  .inspector { padding: var(--size-4-4); overflow-y: auto; height: 100%; min-width: 0; }
  .actions { display: flex; gap: var(--size-4-2); margin-bottom: var(--size-4-3); }
  h2 { margin: 0 0 var(--size-4-1); }
  h3 { margin: var(--size-4-4) 0 var(--size-4-1); font-size: var(--font-ui-small); text-transform: uppercase; color: var(--text-muted); }
  ul { margin: 0; padding: 0; list-style: none; }
  .facts, .tags { display: flex; flex-wrap: wrap; gap: var(--size-4-2); margin-block: var(--size-4-2); }
  .facts li, .tags li { padding: 0 var(--size-4-2); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); font-size: var(--font-ui-small); }
  .id { font-family: var(--font-monospace); font-size: var(--font-ui-smaller); color: var(--text-muted); }
  .empty { color: var(--text-muted); }
  .link { height: auto; padding: var(--size-4-1) var(--size-4-2); background: transparent; box-shadow: none; color: var(--text-accent); text-align: start; }
  .link:hover { text-decoration: underline; }
</style>
