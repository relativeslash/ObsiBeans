<script lang="ts">
  import { ancestry, eligibleParents } from '../state/relations.ts';
  import type { BeanSummary, Snapshot } from '../state/model.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import BeanPicker from './BeanPicker.svelte';
  import { t } from './i18n.ts';
  import SaveFeedback from './SaveFeedback.svelte';

  interface Props {
    project: WorkspaceState;
    snapshot: Snapshot;
    bean: BeanSummary;
    onOpen: (id: string) => void;
  }
  let { project, snapshot, bean, onOpen }: Props = $props();

  let picking = $state(false);
  /** This component started the last write, so its result is shown here and not under another field. */
  let mine = $state(false);
  let saved = $state(false);

  const save = $derived(snapshot.saves.get(bean.id));
  const locked = $derived(bean.problems.length > 0 || save?.kind === 'pending' || save?.kind === 'uncertain');
  const trail = $derived(ancestry(snapshot.beans, bean.id));
  // The picker is the only reader of this list, so it is not built for beans that are never edited.
  const choices = $derived(picking ? eligibleParents(snapshot.beans, bean, project.vocabulary.types) : undefined);
  const candidates = $derived(choices?.kind === 'options' ? choices.beans.filter((one) => !one.problems.includes('duplicate-id')) : []);

  /** Opens the picker (the TUI's `p`); a milestone has no parent to pick and a busy bean cannot change. */
  export function open(): void {
    if (!locked && bean.type !== 'milestone') picking = true;
  }

  async function setParent(parentId: string | null): Promise<void> {
    picking = false;
    mine = true;
    saved = false;
    saved = (await project.mutate(bean.id, { kind: 'parent', parentId })).kind === 'saved';
  }
</script>

<section aria-labelledby="parent-heading-{bean.id}">
  <h3 id="parent-heading-{bean.id}">{t('inspector.parent')}</h3>
  {#if trail.chain.length === 0 && trail.missingId === undefined}
    <p class="empty">{t('inspector.noneRelated')}</p>
  {:else}
    <nav aria-label={t('parent.breadcrumb')}>
      <ol>
        {#each trail.chain as ancestor (ancestor.path)}
          <li><button type="button" class="link" onclick={() => { onOpen(ancestor.id); }}><span class="id">{ancestor.id}</span> {ancestor.title}</button></li>
        {/each}
        {#if trail.missingId !== undefined}<li><span class="id">{t('inspector.missing', { id: trail.missingId })}</span></li>{/if}
        <li aria-current="page">{bean.title}</li>
      </ol>
    </nav>
  {/if}
  {#if trail.loop}<p class="empty" role="status">{t('parent.loop')}</p>{/if}
  {#if bean.type === 'milestone'}
    <p class="empty">{t('parent.milestone')}</p>
  {:else}
    <div class="buttons">
      <button type="button" disabled={locked} aria-expanded={picking} onclick={() => { picking = !picking; }}>{bean.parentId === null ? t('parent.set') : t('parent.change')}</button>
      {#if bean.parentId !== null}
        <button type="button" disabled={locked} onclick={() => void setParent(null)}>{t('parent.remove')}</button>
      {/if}
    </div>
  {/if}
  {#if choices?.kind === 'options'}
    <BeanPicker
      label={t('parent.pick')}
      {candidates}
      current={bean.parentId}
      noneLabel={t('parent.none')}
      onPick={(id) => void setParent(id)}
      onNone={() => void setParent(null)}
      onCancel={() => { picking = false; }}
    />
  {/if}
  {#if mine && save}
    <SaveFeedback {project} saveKey={bean.id} {save} />
  {:else if mine && saved}
    <p class="empty" role="status">{t('parent.saved')}</p>
  {/if}
</section>

<style>
  h3 { margin: var(--size-4-4) 0 var(--size-4-1); font-size: var(--font-ui-small); text-transform: uppercase; color: var(--text-muted); }
  ol { display: flex; flex-wrap: wrap; margin: 0; padding: 0; list-style: none; }
  li:not(:last-child)::after { content: '›'; margin-inline: var(--size-4-1); color: var(--text-muted); }
  .buttons { display: flex; flex-wrap: wrap; gap: var(--size-4-2); margin-top: var(--size-4-2); }
  .id { font-family: var(--font-monospace); font-size: var(--font-ui-smaller); color: var(--text-muted); }
  .empty { margin: 0; color: var(--text-muted); }
  .link { height: auto; padding: var(--size-4-1) var(--size-4-2); background: transparent; box-shadow: none; color: var(--text-accent); text-align: start; }
  .link:hover { text-decoration: underline; }
</style>
