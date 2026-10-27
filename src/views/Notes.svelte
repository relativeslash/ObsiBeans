<script lang="ts">
  import type { BeanSummary } from '../state/model.ts';
  import type { RelatedNote, WorkspaceHost } from './host.ts';
  import { t } from './i18n.ts';

  interface Props {
    host: WorkspaceHost;
    bean: BeanSummary;
  }
  let { host, bean }: Props = $props();

  let notes = $state.raw<readonly RelatedNote[]>([]);
  let missing = $state(false);

  // Obsidian resolves the links, so read them again whenever it reports a change or the bean's file moved.
  $effect(() => {
    const read = (): void => { notes = host.relatedNotes(bean.id); };
    void bean.path;
    read();
    return host.onBindingChange(read);
  });

  async function open(path: string): Promise<void> {
    missing = !(await host.openNote(path));
  }
</script>

<section aria-labelledby="notes-{bean.id}">
  <h3 id="notes-{bean.id}">{t('notes.heading')}</h3>
  {#if notes.length === 0}
    <p class="empty">{t('notes.none')}</p>
  {:else}
    <ul>
      {#each notes as note (`${note.kind}:${note.path}`)}
        <li>
          <button type="button" class="link" aria-label={`${t(`notes.${note.kind}`)}: ${t('notes.open', { path: note.path })}`} onclick={() => void open(note.path)}>
            {note.path.replace(/\.md$/, '')}
          </button>
          <span class="kind">{t(`notes.${note.kind}`)}</span>
        </li>
      {/each}
    </ul>
  {/if}
  {#if missing}<p class="empty" role="status">{t('notes.missing')}</p>{/if}
</section>

<style>
  h3 { margin: var(--size-4-4) 0 var(--size-4-1); font-size: var(--font-ui-small); text-transform: uppercase; color: var(--text-muted); }
  ul { margin: 0; padding: 0; list-style: none; }
  .empty, .kind { color: var(--text-muted); font-size: var(--font-ui-smaller); }
  .link { height: auto; padding: var(--size-4-1) var(--size-4-2); background: transparent; box-shadow: none; color: var(--text-accent); text-align: start; }
  .link:hover { text-decoration: underline; }
</style>
