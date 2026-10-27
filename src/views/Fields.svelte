<script lang="ts">
  import type { BeanSummary, Change, Snapshot } from '../state/model.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import { typeBlockers } from '../state/relations.ts';
  import { parseTags } from './create-form.ts';
  import { t } from './i18n.ts';
  import SaveFeedback from './SaveFeedback.svelte';

  interface Props {
    project: WorkspaceState;
    snapshot: Snapshot;
    bean: BeanSummary;
  }
  let { project, snapshot, bean }: Props = $props();

  type Field = 'title' | 'status' | 'type' | 'priority' | 'tags';
  type Pick = 'status' | 'type' | 'priority';
  const LISTS = { status: 'statuses', type: 'types', priority: 'priorities' } as const;
  const PICKS: readonly Pick[] = ['status', 'type', 'priority'];

  let root: HTMLElement | undefined = $state();
  /** The last edit tried, so feedback sits at its field and a conflict can be applied again on purpose. */
  let attempt = $state<{ readonly field: Field; readonly change: Change } | undefined>();
  let saved = $state<Field | undefined>();
  /** Text being typed; undefined while the field shows the stored value. */
  let titleEdit = $state<string>();
  let tagsEdit = $state<string>();

  const save = $derived(snapshot.saves.get(bean.id));
  const locked = $derived(bean.problems.length > 0 || save?.kind === 'pending' || save?.kind === 'uncertain');
  const title = $derived(titleEdit ?? bean.title);
  const tags = $derived(tagsEdit ?? bean.tags.join(' '));
  /** Types the current parent or children would not accept (BC-30); Beans checks none of this itself. */
  const blockedTypes = $derived(typeBlockers(snapshot.beans, bean, project.vocabulary.types));

  /** A pending save shows the value the user asked for, never as data. */
  function valueOf(field: Pick): string {
    const pending = save?.kind === 'pending' && 'kind' in save.intent && save.intent.kind === 'fields' ? save.intent[field] : undefined;
    return pending ?? bean[field];
  }

  const show = (value: string | readonly string[] | undefined): string => (Array.isArray(value) ? value.join(' ') : String(value ?? ''));

  /** Your value next to the one on disk now, so a conflict is reviewed rather than guessed. */
  function values(field: Field): string | undefined {
    if (save?.kind !== 'conflict' || attempt?.change.kind !== 'fields' || !save.error.current) return undefined;
    return t('field.conflictValues', { mine: show(attempt.change[field]), current: show(save.error.current[field]) });
  }

  async function apply(field: Field, change: Change, basis?: string): Promise<void> {
    attempt = { field, change };
    saved = undefined;
    const result = await project.mutate(bean.id, change, basis);
    if (result.kind !== 'saved') return;
    saved = field;
    if (field === 'title') titleEdit = undefined;
    if (field === 'tags') tagsEdit = undefined;
  }

  async function pick(event: Event, field: Pick): Promise<void> {
    const select = event.currentTarget as HTMLSelectElement;
    await apply(field, { kind: 'fields', [field]: select.value });
    // Unsaved means the stored value stands, so the picker must not keep showing the choice.
    select.value = project.getSnapshot().beans.find((one) => one.id === bean.id)?.[field] ?? select.value;
  }

  /** Moves focus to a picker (the TUI's `s`, `t` and `P` keys). */
  export function focus(field: Pick): void {
    root?.querySelector<HTMLElement>(`[data-field="${field}"]`)?.focus();
  }

  const onTextKey = (event: KeyboardEvent, field: 'title' | 'tags'): void => {
    if (event.key !== 'Enter' || locked) return;
    event.preventDefault();
    if (field === 'title') void apply('title', { kind: 'fields', title });
    else void apply('tags', { kind: 'fields', tags: parseTags(tags) });
  };
</script>

{#snippet feedback(field: Field)}
  {#if attempt?.field === field && save}
    {@const comparison = values(field)}
    {#if comparison}<p class="done">{comparison}</p>{/if}
    <SaveFeedback {project} saveKey={bean.id} {save} onOverwrite={(revision) => { if (attempt) void apply(attempt.field, attempt.change, revision); }} />
  {:else if saved === field && !save}
    <p class="done" role="status">{t('field.saved')}</p>
  {/if}
{/snippet}

<div class="fields" bind:this={root}>
  <div class="field wide">
    <label for="field-title-{bean.id}">{t('field.title')}</label>
    <input id="field-title-{bean.id}" type="text" value={title} disabled={locked} oninput={(event) => { titleEdit = event.currentTarget.value; }} onkeydown={(event) => { onTextKey(event, 'title'); }} />
    {#if titleEdit !== undefined && titleEdit !== bean.title}
      <div class="buttons">
        <button type="button" disabled={locked} onclick={() => void apply('title', { kind: 'fields', title })}>{t('field.save')}</button>
        <button type="button" onclick={() => { titleEdit = undefined; }}>{t('field.revert')}</button>
      </div>
    {/if}
    {@render feedback('title')}
  </div>
  {#each PICKS as field (field)}
    <div class="field">
      <label for="field-{field}-{bean.id}">{t(`field.${field}`)}</label>
      <select id="field-{field}-{bean.id}" data-field={field} disabled={locked} value={valueOf(field)} onchange={(event) => void pick(event, field)}>
        {#each project.vocabulary[LISTS[field]] as value (value)}<option {value} disabled={field === 'type' && blockedTypes.has(value)}>{value}</option>{/each}
        {#if !project.vocabulary[LISTS[field]].includes(bean[field])}<option value={bean[field]}>{bean[field]}</option>{/if}
      </select>
      {#if field === 'type'}
        {#each blockedTypes as [type, reason] (type)}<p class="done">{t('field.typeBlocked', { type, reason })}</p>{/each}
      {/if}
      {@render feedback(field)}
    </div>
  {/each}
  <div class="field wide">
    <label for="field-tags-{bean.id}">{t('field.tags')}</label>
    <input id="field-tags-{bean.id}" type="text" value={tags} disabled={locked} oninput={(event) => { tagsEdit = event.currentTarget.value; }} onkeydown={(event) => { onTextKey(event, 'tags'); }} />
    {#if tagsEdit !== undefined && tagsEdit !== bean.tags.join(' ')}
      <div class="buttons">
        <button type="button" disabled={locked} onclick={() => void apply('tags', { kind: 'fields', tags: parseTags(tags) })}>{t('field.save')}</button>
        <button type="button" onclick={() => { tagsEdit = undefined; }}>{t('field.revert')}</button>
      </div>
    {/if}
    {@render feedback('tags')}
  </div>
</div>

<style>
  .fields { display: flex; flex-wrap: wrap; gap: var(--size-4-3); margin-block: var(--size-4-3); }
  .field { display: flex; flex-direction: column; gap: var(--size-4-1); min-width: 8rem; }
  .wide { flex-basis: 100%; }
  label { font-size: var(--font-ui-smaller); color: var(--text-muted); }
  .buttons { display: flex; gap: var(--size-4-2); }
  .done { margin: 0; color: var(--text-muted); font-size: var(--font-ui-small); }
</style>
