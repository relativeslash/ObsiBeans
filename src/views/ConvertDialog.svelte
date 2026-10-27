<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { bodyFrom, titleFrom } from '../state/note-text.ts';
  import { EMPTY_FORM, toNewBean } from './create-form.ts';
  import { follow } from './follow.svelte.ts';
  import type { InsertMode, InsertOutcome, NoteTarget, WorkspaceHost } from './host.ts';
  import { t } from './i18n.ts';
  import InsertFailed from './InsertFailed.svelte';
  import SaveFeedback from './SaveFeedback.svelte';

  interface Props {
    host: WorkspaceHost;
    target: NoteTarget;
    onClose: () => void;
  }
  let { host, target, onClose }: Props = $props();

  /** The save key of this dialog's one creation. */
  const LOCAL_KEY = 'convert';
  const KEY = `new:${LOCAL_KEY}`;
  const FIELDS = [
    ['type', 'types'],
    ['status', 'statuses'],
    ['priority', 'priorities'],
  ] as const;
  const MODES = ['none', 'after', 'replace'] as const;

  const followed = untrack(() => follow(host));
  onDestroy(followed.stop);
  const project = $derived(followed.state);
  const snapshot = $derived(followed.snapshot);

  // The proposal is plain data derived from the selection; the user confirms or edits it before anything is created.
  const proposed = untrack(() => titleFrom(target.text));
  let title = $state(proposed);
  let body = $state(untrack(() => bodyFrom(target.text, proposed, target.noteLink, t('convert.sourceLabel'))));
  let chosen = $state({ type: '', status: '', priority: '' });
  let mode = $state<InsertMode | 'none'>('after');
  /** Set once Beans confirmed the creation. From then on only the note write can be retried; the creation never runs again. */
  let created = $state<{ id: string; title: string } | undefined>();
  let outcome = $state<InsertOutcome | undefined>();

  const save = $derived(snapshot?.saves.get(KEY));
  const busy = $derived(save?.kind === 'pending' || save?.kind === 'uncertain');

  // A failed or conflicting attempt is not worth keeping once the dialog is gone; an unreconciled one is, so a reopened dialog cannot create twice.
  onDestroy(() => {
    const kind = untrack(() => project?.getSnapshot().saves.get(KEY)?.kind);
    if (kind === 'failed' || kind === 'conflict') project?.dismissSave(KEY);
  });

  function insert(): void {
    if (created && mode !== 'none') outcome = target.insert(created.id, created.title, mode);
  }

  async function submit(): Promise<void> {
    if (!project || busy || created || title.trim() === '') return;
    const result = await project.create(LOCAL_KEY, toNewBean({ ...EMPTY_FORM, title, body, ...chosen }, false));
    if (result.kind !== 'saved') return;
    created = { id: result.bean.id, title: result.bean.title };
    insert();
  }

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void submit();
  };

  const defaultOf = (field: 'type' | 'status' | 'priority'): string => project?.defaults[field] ?? '';
</script>

<section class="dialog" aria-labelledby="convert-heading">
  <h2 id="convert-heading">{t('convert.title')}</h2>
  {#if !project || !snapshot}
    <p role="status">{t('note.noProject', { binding: followed.bindingText })}</p>
    <button type="button" onclick={onClose}>{t('note.close')}</button>
  {:else if created}
    <p role="status">
      {#if mode === 'none'}{t('convert.created', { id: created.id })}
      {:else if outcome === 'inserted'}{t('convert.createdLinked', { id: created.id })}
      {:else}{t('convert.createdNotLinked', { id: created.id })}{/if}
    </p>
    {#if outcome && outcome !== 'inserted'}
      <InsertFailed reason={outcome} link={target.link(created.id, created.title)} onRetry={insert} />
    {/if}
    <div class="buttons">
      <button type="button" onclick={() => void host.openIssue(created?.id ?? '')}>{t('convert.open')}</button>
      <button type="button" class="mod-cta" onclick={onClose}>{t('note.close')}</button>
    </div>
  {:else}
    <p class="intro">{t('convert.intro', { note: target.notePath })}</p>
    <div class="field">
      <label for="convert-title">{t('create.field.title')}</label>
      <input id="convert-title" type="text" bind:value={title} onkeydown={onKey} />
    </div>
    <div class="row">
      {#each FIELDS as [field, list] (field)}
        <div class="field">
          <label for="convert-{field}">{t(`field.${field}`)}</label>
          <select id="convert-{field}" bind:value={chosen[field]}>
            <option value="">{t('create.default', { value: defaultOf(field) })}</option>
            {#each project.vocabulary[list] as value (value)}<option {value}>{value}</option>{/each}
          </select>
        </div>
      {/each}
    </div>
    <div class="field">
      <label for="convert-body">{t('convert.body')}</label>
      <textarea id="convert-body" rows="8" bind:value={body}></textarea>
    </div>
    <fieldset>
      <legend>{t('convert.insert')}</legend>
      {#each MODES as option (option)}
        <label class="choice"><input type="radio" name="convert-insert" value={option} bind:group={mode} /> {t(`convert.insert.${option}`)}</label>
      {/each}
    </fieldset>
    <SaveFeedback {project} saveKey={KEY} {save} />
    <div class="buttons">
      <button type="button" class="mod-cta" disabled={busy || title.trim() === ''} onclick={() => void submit()}>{t('convert.submit')}</button>
      <button type="button" disabled={busy} onclick={onClose}>{t('create.cancel')}</button>
    </div>
  {/if}
</section>

<style>
  h2 { margin: 0 0 var(--size-4-3); }
  .intro { margin: 0 0 var(--size-4-3); color: var(--text-muted); font-size: var(--font-ui-small); }
  .field { display: flex; flex-direction: column; gap: var(--size-4-1); margin-bottom: var(--size-4-3); }
  .row { display: flex; flex-wrap: wrap; gap: var(--size-4-3); }
  label, legend { font-size: var(--font-ui-smaller); color: var(--text-muted); }
  .choice { display: block; margin-bottom: var(--size-4-1); font-size: var(--font-ui-small); color: var(--text-normal); }
  textarea { font-family: var(--font-monospace); }
  fieldset { margin: 0 0 var(--size-4-3); padding: 0; border: 0; }
  .buttons { display: flex; flex-wrap: wrap; gap: var(--size-4-2); }
</style>
