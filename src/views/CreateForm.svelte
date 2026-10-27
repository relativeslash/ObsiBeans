<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { Snapshot } from '../state/model.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import { EMPTY_FORM, FORM_KEY, isBlank, parseForm, serializeForm, toNewBean, type FormValues } from './create-form.ts';
  import { t } from './i18n.ts';
  import SaveFeedback from './SaveFeedback.svelte';

  interface Props {
    project: WorkspaceState;
    snapshot: Snapshot;
    /** Starts the form under this parent (the new-child action). Beans validates the chosen type against it. */
    parentId?: string | undefined;
    /** Called with the new bean's ID once Beans confirmed the creation. */
    onDone: (id: string) => void;
    /** Leaves the form. Creates nothing. */
    onCancel: () => void;
  }
  let { project, snapshot, parentId, onDone, onCancel }: Props = $props();

  const KEY = `new:${FORM_KEY}`;
  const FIELDS = [
    ['type', 'types'],
    ['status', 'statuses'],
    ['priority', 'priorities'],
  ] as const;

  // An unsaved form from an earlier visit comes back; it is the one creation draft.
  const restored = untrack(() => snapshot.drafts.find((entry) => entry.draft.kind === 'creation' && entry.draft.key === FORM_KEY));
  let values = $state<FormValues>({ ...(restored ? parseForm(restored.draft.text) : EMPTY_FORM), ...(untrack(() => parentId) !== undefined && { parent: untrack(() => parentId) ?? '' }) });
  let title: HTMLInputElement | undefined = $state();

  const save = $derived(snapshot.saves.get(KEY));
  const busy = $derived(save?.kind === 'pending' || save?.kind === 'uncertain');

  $effect(() => {
    const text = serializeForm(values);
    untrack(() => {
      if (isBlank(values)) project.discardDraft('creation', FORM_KEY);
      else project.setDraft('creation', FORM_KEY, text, null);
    });
  });
  void tick().then(() => title?.focus());

  async function submit(draft: boolean): Promise<void> {
    if (busy) return;
    const result = await project.create(FORM_KEY, toNewBean(values, draft));
    if (result.kind === 'saved') onDone(result.bean.id);
  }

  function cancel(): void {
    project.discardDraft('creation', FORM_KEY);
    project.dismissSave(KEY);
    onCancel();
  }

  const defaultOf = (field: 'type' | 'status' | 'priority'): string => project.defaults[field];
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void submit(false);
  };
  /** Escape leaves the form from any field and keeps what was typed as the creation draft; only Cancel discards it. */
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    onCancel();
  };
</script>

<!-- Escape bubbles from the fields; the Cancel button is the visible equivalent. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="create" aria-labelledby="create-heading" onkeydown={onEscape}>
  <h2 id="create-heading">{t('create.title')}</h2>
  <div class="field">
    <label for="create-title">{t('create.field.title')}</label>
    <input id="create-title" type="text" bind:this={title} bind:value={values.title} onkeydown={onKey} />
  </div>
  {#if values.parent !== ''}
    <p class="parent">
      {t('create.parent', { id: values.parent })}
      <button type="button" onclick={() => { values.parent = ''; }}>{t('create.parentRemove')}</button>
    </p>
  {/if}
  {#if values.expanded}
    <div class="row">
      {#each FIELDS as [field, list] (field)}
        <div class="field">
          <label for="create-{field}">{t(`field.${field}`)}</label>
          <select id="create-{field}" bind:value={values[field]}>
            <option value="">{t('create.default', { value: defaultOf(field) })}</option>
            {#each project.vocabulary[list] as value (value)}<option {value}>{value}</option>{/each}
          </select>
        </div>
      {/each}
    </div>
    <div class="field">
      <label for="create-tags">{t('field.tags')}</label>
      <input id="create-tags" type="text" bind:value={values.tags} />
    </div>
    <div class="field">
      <label for="create-body">{t('create.body')}</label>
      <textarea id="create-body" rows="8" bind:value={values.body}></textarea>
    </div>
  {/if}
  <SaveFeedback {project} saveKey={KEY} {save} />
  <div class="buttons">
    <button type="button" class="mod-cta" disabled={busy} onclick={() => void submit(false)}>{t('create.submit')}</button>
    <button type="button" disabled={busy} onclick={() => void submit(true)}>{t('create.draft')}</button>
    <button type="button" onclick={cancel}>{t('create.cancel')}</button>
    <button type="button" aria-expanded={values.expanded} onclick={() => { values.expanded = !values.expanded; }}>{values.expanded ? t('create.less') : t('create.more')}</button>
  </div>
  <p class="hint">{t('create.draftHint')} {t('create.escapeHint')}</p>
</section>

<style>
  .create { padding: var(--size-4-4); overflow-y: auto; height: 100%; min-width: 0; }
  h2 { margin: 0 0 var(--size-4-3); }
  .field { display: flex; flex-direction: column; gap: var(--size-4-1); margin-bottom: var(--size-4-3); }
  .row { display: flex; flex-wrap: wrap; gap: var(--size-4-3); }
  label { font-size: var(--font-ui-smaller); color: var(--text-muted); }
  textarea { font-family: var(--font-monospace); }
  .buttons { display: flex; flex-wrap: wrap; gap: var(--size-4-2); }
  .parent { margin: 0 0 var(--size-4-3); color: var(--text-muted); font-size: var(--font-ui-small); }
  .hint { color: var(--text-muted); font-size: var(--font-ui-smaller); }
</style>
