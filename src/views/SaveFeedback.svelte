<script lang="ts">
  import type { SaveState } from '../state/model.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import { describeError } from './errors.ts';
  import { t } from './i18n.ts';

  interface Props {
    project: WorkspaceState;
    /** The save key: a bean ID, or `new:<localKey>` for a creation. */
    saveKey: string;
    save: SaveState | undefined;
    /** Offered after a conflict: applies the same change again on top of the revision that is there now. */
    onOverwrite?: ((revision: string) => void) | undefined;
  }
  let { project, saveKey, save, onOverwrite }: Props = $props();

  const dismiss = (): void => { project.dismissSave(saveKey); };
  const revision = $derived(save?.kind === 'conflict' ? (save.error.current?.revision ?? null) : null);
</script>

{#if save?.kind === 'pending'}
  <p class="feedback" role="status">{t('row.saving')}</p>
{:else if save}
  <div class="feedback" role="alert">
    <p>{describeError(save.error)}</p>
    {#if save.kind === 'uncertain' && save.error.createdIds.length > 0}
      <p>{t('save.created', { ids: save.error.createdIds.join(', ') })}</p>
    {/if}
    {#if onOverwrite && revision !== null}
      <button type="button" onclick={() => { onOverwrite(revision); }}>{t('row.applyAgain')}</button>
    {/if}
    <button type="button" onclick={dismiss}>{save.kind === 'uncertain' ? t('save.reconciled') : t('action.dismiss')}</button>
  </div>
{/if}

<style>
  .feedback { margin: var(--size-4-1) 0; color: var(--text-muted); font-size: var(--font-ui-small); }
  div.feedback { color: var(--text-error); }
  p { margin: 0 0 var(--size-4-1); }
</style>
