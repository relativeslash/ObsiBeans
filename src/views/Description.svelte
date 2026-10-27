<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { Action } from 'svelte/action';
  import { bodyText, checklistItems } from '../state/body.ts';
  import type { BeanDetail, BeanSummary, Outcome, Snapshot } from '../state/model.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import { describeError } from './errors.ts';
  import type { WorkspaceHost } from './host.ts';
  import { t } from './i18n.ts';
  import SaveFeedback from './SaveFeedback.svelte';

  interface Props {
    host: WorkspaceHost;
    project: WorkspaceState;
    snapshot: Snapshot;
    bean: BeanSummary;
  }
  let { host, project, snapshot, bean }: Props = $props();

  /** A description edit. `basis` is the revision the text started from; `remote` is a fresher version found while restoring. */
  interface Editing {
    readonly text: string;
    readonly basis: string | null;
    readonly remote?: BeanDetail | null;
  }

  // The inspector keys this component by bean, so the ID never changes.
  const id = untrack(() => bean.id);
  let detail = $state.raw<Outcome<BeanDetail | null>>();
  let editing = $state.raw<Editing>();
  /** This component started the last write, so its result belongs here and not to a field above. */
  let mine = $state(false);
  let loads = 0;
  let editor: HTMLTextAreaElement | undefined = $state();

  // Re-read whenever the bean's file changed, so the text, checklist and revision are never older than the list.
  const revision = $derived(bean.revision);
  const reload = (): void => {
    const load = ++loads;
    void project.detail(id).then((outcome) => {
      if (load === loads) detail = outcome;
    });
  };
  $effect(() => {
    void revision;
    reload();
  });

  const loaded = $derived(detail?.ok && detail.value ? detail.value : undefined);
  const save = $derived(snapshot.saves.get(id));
  const conflict = $derived(mine && save?.kind === 'conflict' ? save.error : undefined);
  const remote = $derived(conflict ? conflict.current : editing?.remote);
  const reviewing = $derived(editing !== undefined && (conflict !== undefined || editing.remote !== undefined));
  const stored = $derived(snapshot.drafts.find((entry) => entry.draft.kind === 'description' && entry.draft.key === id));
  const locked = $derived(bean.problems.length > 0 || save?.kind === 'pending' || save?.kind === 'uncertain');
  const items = $derived(loaded ? checklistItems(loaded.body) : []);

  const render: Action<HTMLElement, string> = (node, markdown) => {
    let release = host.renderMarkdown(markdown, node, id);
    return {
      update(next) {
        release();
        node.replaceChildren();
        release = host.renderMarkdown(next, node, id);
      },
      destroy() {
        release();
      },
    };
  };

  export function edit(): void {
    if (loaded && !editing && !locked) startEditing({ text: bodyText(loaded.body), basis: loaded.revision });
  }

  function startEditing(next: Editing): void {
    editing = next;
    void tick().then(() => editor?.focus());
  }

  function type(text: string): void {
    if (!editing) return;
    editing = { ...editing, text };
    if (loaded && text === bodyText(loaded.body)) project.discardDraft('description', id);
    else project.setDraft('description', id, text, editing.basis);
  }

  /** Writes the editor's text on top of `basis`. The state keeps the text as a draft if this fails. */
  async function write(basis: string | null): Promise<void> {
    if (!editing) return;
    mine = true;
    const result = await project.mutate(id, { kind: 'body', body: editing.text }, basis ?? undefined);
    if (result.kind !== 'saved') return;
    detail = { ok: true, value: result.bean };
    editing = undefined;
  }

  function cancel(): void {
    project.discardDraft('description', id);
    project.dismissSave(id);
    editing = undefined;
  }

  /** The reviewed current version becomes the basis of the user's text; nothing is saved by this. */
  function keepEditing(): void {
    if (!editing) return;
    editing = { text: editing.text, basis: remote?.revision ?? editing.basis };
    project.dismissSave(id);
  }

  function useCurrent(): void {
    project.discardDraft('description', id);
    project.dismissSave(id);
    editing = undefined;
  }

  async function restore(): Promise<void> {
    const outcome = project.restoreDraft('description', id);
    if (outcome.kind === 'restore') startEditing({ text: outcome.draft.text, basis: outcome.draft.revision });
    else if (outcome.kind === 'conflict') {
      const fresh = await project.detail(id);
      startEditing({ text: outcome.draft.text, basis: outcome.draft.revision, remote: fresh.ok ? fresh.value : null });
    }
  }

  async function check(event: Event, line: number, text: string, checked: boolean): Promise<void> {
    const box = event.currentTarget as HTMLInputElement;
    mine = true;
    const result = await project.mutate(id, { kind: 'checklist', line, text, checked: box.checked });
    // Only a confirmed write changes the item; otherwise the box must show what is stored.
    if (result.kind === 'saved') detail = { ok: true, value: result.bean };
    else box.checked = checked;
  }

  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The text stays visible and selectable in the editor.
    }
  };

  const when = (iso: string): string => iso.replace('T', ' ').replace(/:\d\dZ$/, ' UTC');
</script>

<section class="description" aria-labelledby="description-heading-{id}">
  <div class="head">
    <h3 id="description-heading-{id}">{t('description.heading')}</h3>
    {#if loaded && !editing}
      <button type="button" disabled={locked} onclick={edit}>{t('description.edit')}</button>
    {/if}
  </div>

  {#if stored && !editing}
    <div class="banner" role="status">
      <span>{t(stored.status === 'changed' ? 'description.draftChanged' : 'description.draft', { time: when(stored.draft.savedAt) })}</span>
      <button type="button" onclick={() => void restore()}>{t('description.restore')}</button>
      <button type="button" onclick={() => { project.discardDraft('description', id); }}>{t('description.discard')}</button>
    </div>
  {/if}

  {#if editing}
    {#if reviewing}
      <div class="review" role="alert">
        <p>{remote === null ? t('description.deleted') : t('description.review')}</p>
        {#if remote}
          <div class="versions">
            <div><h4>{t('description.mine')}</h4><pre>{editing.text}</pre></div>
            <div><h4>{t('description.current')}</h4><pre>{bodyText(remote.body)}</pre></div>
          </div>
          <div class="buttons">
            <button type="button" onclick={() => void write(remote.revision)}>{t('description.overwrite')}</button>
            <button type="button" onclick={useCurrent}>{t('description.useCurrent')}</button>
            <button type="button" onclick={keepEditing}>{t('description.keepEditing')}</button>
          </div>
        {/if}
      </div>
    {/if}
    <label class="label" for="description-text-{id}">{t('description.label')}</label>
    <textarea id="description-text-{id}" bind:this={editor} rows="12" value={editing.text} oninput={(event) => { type(event.currentTarget.value); }}></textarea>
    {#if mine && !conflict}<SaveFeedback {project} saveKey={id} {save} />{/if}
    <div class="buttons">
      <button type="button" class="mod-cta" disabled={locked || reviewing} onclick={() => void write(editing?.basis ?? null)}>{t('description.save')}</button>
      <button type="button" onclick={cancel}>{t('description.cancel')}</button>
      {#if remote === null}<button type="button" onclick={() => void copy(editing?.text ?? '')}>{t('action.copyText')}</button>{/if}
    </div>
  {:else if !detail}
    <p class="muted" role="status">{t('description.loading')}</p>
  {:else if !detail.ok}
    <div role="alert">
      <p>{describeError(detail.error)}</p>
      <button type="button" onclick={reload}>{t('action.retry')}</button>
    </div>
  {:else if detail.value === null}
    <p class="muted" role="status">{t('description.gone')}</p>
  {:else}
    {#if bodyText(detail.value.body).trim() === ''}
      <p class="muted">{t('description.empty')}</p>
    {:else}
      <div class="rendered" use:render={detail.value.body}></div>
    {/if}
    {#if items.length > 0}
      <ul class="checklist" aria-label={t('description.checklist')}>
        {#each items as item (item.line)}
          <li>
            <label>
              <input type="checkbox" checked={item.checked} disabled={locked} onchange={(event) => void check(event, item.line, item.text, item.checked)} />
              {item.label}
            </label>
          </li>
        {/each}
      </ul>
    {/if}
    {#if mine}<SaveFeedback {project} saveKey={id} {save} />{/if}
  {/if}
</section>

<style>
  .head { display: flex; align-items: center; justify-content: space-between; gap: var(--size-4-2); }
  h3 { margin: var(--size-4-4) 0 var(--size-4-1); font-size: var(--font-ui-small); text-transform: uppercase; color: var(--text-muted); }
  h4 { margin: 0 0 var(--size-4-1); font-size: var(--font-ui-smaller); }
  .muted, .label { color: var(--text-muted); font-size: var(--font-ui-small); }
  textarea { width: 100%; font-family: var(--font-monospace); }
  .buttons { display: flex; flex-wrap: wrap; gap: var(--size-4-2); margin-top: var(--size-4-2); }
  .banner, .review { display: flex; flex-wrap: wrap; align-items: center; gap: var(--size-4-2); margin-block: var(--size-4-2); padding: var(--size-4-2); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); }
  .review { flex-direction: column; align-items: stretch; }
  .review p { margin: 0; }
  .versions { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: var(--size-4-2); }
  pre { margin: 0; max-height: 14rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  .checklist { margin: var(--size-4-2) 0 0; padding: 0; list-style: none; }
</style>
