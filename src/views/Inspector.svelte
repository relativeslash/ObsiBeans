<script lang="ts">
  import type { Snapshot } from '../state/model.ts';
  import { relationsOf } from '../state/navigation.ts';
  import { canHaveChildren } from '../state/relations.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import { DETAIL_KEYS, isText, type ActionId } from './actions.ts';
  import Description from './Description.svelte';
  import Fields from './Fields.svelte';
  import type { WorkspaceHost } from './host.ts';
  import { t } from './i18n.ts';
  import Links from './Links.svelte';
  import Notes from './Notes.svelte';
  import Parent from './Parent.svelte';

  interface Props {
    host: WorkspaceHost;
    project: WorkspaceState;
    snapshot: Snapshot;
    /** The bean to show. */
    id: string | null;
    onOpen: (id: string) => void;
    /** Present when going back is possible. */
    onBack?: (() => void) | undefined;
    /** Present when the bean can still be opened in its own tab. */
    onOpenTab?: (() => void) | undefined;
    /** Opens the creation form with this bean as the parent. */
    onNewChild?: ((parentId: string) => void) | undefined;
    /** Opens the shortcut help (`?`). */
    onHelp: () => void;
  }
  let { host, project, snapshot, id, onOpen, onBack, onOpenTab, onNewChild, onHelp }: Props = $props();

  let fields: Fields | undefined = $state();
  let description: Description | undefined = $state();
  let parent: Parent | undefined = $state();
  let links: Links | undefined = $state();
  /** The outcome of the last action (copy, open): a status line, empty when there is nothing to say. */
  let note = $state('');

  const bean = $derived(snapshot.beans.find((one) => one.id === id));
  const relations = $derived(id === null ? undefined : relationsOf(snapshot.beans, id));
  const orphan = $derived(snapshot.drafts.find((entry) => entry.draft.kind === 'description' && entry.draft.key === id)?.draft);

  async function copy(text: string | undefined, done: string): Promise<void> {
    if (text === undefined) {
      note = t('source.missing');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      note = done;
    } catch {
      note = t('copy.failed');
    }
  }

  async function openSource(): Promise<void> {
    note = (await host.openSource(id ?? '')) ? '' : t('source.missing');
  }

  /** One bean action. The keys, the palette commands and the visible controls all come through here. Without a bean only help works. */
  export function run(action: ActionId): void {
    if (action === 'help') return onHelp();
    if (!bean) return;
    if (action === 'status' || action === 'type' || action === 'priority') fields?.focus(action);
    else if (action === 'edit') description?.edit();
    else if (action === 'parent') parent?.open();
    else if (action === 'blocks') links?.openBlocks();
    else if (action === 'copy') void copy(bean.id, t('copy.done', { count: 1 }));
    else if (action === 'openSource') void openSource();
    else if (action === 'copyLink') void copy(host.sourceLink(bean.id), t('copy.linkDone'));
  }

  /** The TUI's detail keys (see `DETAIL_KEYS`), plus Escape for going back. Open pickers stop Escape themselves. */
  function onKey(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isText(event.target as HTMLElement)) return;
    if (event.key === 'Escape' && onBack) {
      event.preventDefault();
      return onBack();
    }
    const action = DETAIL_KEYS[event.key];
    if (!action) return;
    event.preventDefault();
    run(action);
  }

  const when = (iso: string): string => iso.replace('T', ' ').replace(/:\d\dZ$/, ' UTC');
</script>

<!-- Shortcuts bubble from the controls; each one also has a visible control. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<article class="inspector" aria-label={t('inspector.label')} onkeydown={onKey}>
  {#if onBack || onOpenTab || bean}
    <div class="actions">
      {#if onBack}<button type="button" onclick={onBack}>{t('action.back')}</button>{/if}
      {#if onOpenTab}<button type="button" onclick={onOpenTab}>{t('action.openTab')}</button>{/if}
      {#if bean}
        <button type="button" onclick={() => { run('openSource'); }}>{t('action.openSource')}</button>
        <button type="button" onclick={() => { run('copy'); }}>{t('copy.current')}</button>
        <button type="button" onclick={() => { run('copyLink'); }}>{t('action.copyLink')}</button>
      {/if}
    </div>
    <p class="note" role="status">{note}</p>
  {/if}
  {#if id === null}
    <p class="empty">{t('inspector.none')}</p>
  {:else if !bean}
    <p class="empty" role="status">{snapshot.status === 'loading' ? t('list.loading') : t('inspector.gone', { id })}</p>
    {#if orphan}
      <p class="empty">{t('inspector.orphanedDraft')}</p>
      <textarea readonly rows="8" aria-label={t('description.label')} value={orphan.text}></textarea>
      <div class="actions">
        <button type="button" onclick={() => void copy(orphan.text, t('copy.done', { count: 1 }))}>{t('action.copyText')}</button>
        <button type="button" onclick={() => { project.discardDraft('description', orphan.key); }}>{t('description.discard')}</button>
      </div>
    {/if}
  {:else}
    <h2>{bean.title}</h2>
    <p class="id">{bean.id}</p>
    <p class="times"><time datetime={bean.createdAt}>{t('inspector.created', { time: when(bean.createdAt) })}</time> · <time datetime={bean.updatedAt}>{t('inspector.updated', { time: when(bean.updatedAt) })}</time></p>
    {#if bean.problems.length > 0}
      <p class="empty" role="status">{t('inspector.locked', { problems: bean.problems.join(', ') })}</p>
    {/if}
    {#key bean.id}
      <Fields bind:this={fields} {project} {snapshot} {bean} />
      <Description bind:this={description} {host} {project} {snapshot} {bean} />
    {/key}
    {#key bean.id}<Parent bind:this={parent} {project} {snapshot} {bean} {onOpen} />{/key}
    <section>
      <h3>{t('inspector.children')}</h3>
      {#if !relations || relations.children.length === 0}
        <p class="empty">{t('inspector.noneRelated')}</p>
      {:else}
        <ul>
          {#each relations.children as related (related.id)}
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
      {#if onNewChild}
        {#if canHaveChildren(bean.type)}
          <button type="button" onclick={() => { onNewChild(bean.id); }}>{t('children.new')}</button>
        {:else}
          <p class="empty">{t('children.none', { type: bean.type })}</p>
        {/if}
      {/if}
    </section>
    {#key bean.id}<Links bind:this={links} {project} {snapshot} {bean} {onOpen} />{/key}
    {#key bean.id}<Notes {host} {bean} />{/key}
  {/if}
</article>

<style>
  .inspector { padding: var(--size-4-4); overflow-y: auto; height: 100%; min-width: 0; }
  .actions { display: flex; flex-wrap: wrap; gap: var(--size-4-2); margin-bottom: var(--size-4-2); }
  h2 { margin: 0 0 var(--size-4-1); }
  h3 { margin: var(--size-4-4) 0 var(--size-4-1); font-size: var(--font-ui-small); text-transform: uppercase; color: var(--text-muted); }
  ul { margin: 0; padding: 0; list-style: none; }
  textarea { width: 100%; font-family: var(--font-monospace); }
  .times, .note { margin: 0 0 var(--size-4-2); color: var(--text-muted); font-size: var(--font-ui-smaller); }
  .note:empty { display: none; }
  .id { font-family: var(--font-monospace); font-size: var(--font-ui-smaller); color: var(--text-muted); }
  .empty { color: var(--text-muted); }
  .link { height: auto; padding: var(--size-4-1) var(--size-4-2); background: transparent; box-shadow: none; color: var(--text-accent); text-align: start; }
  .link:hover { text-decoration: underline; }
</style>
