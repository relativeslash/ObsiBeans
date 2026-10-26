<script lang="ts">
  import type { Snapshot } from '../state/model.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import { describeError } from './errors.ts';
  import { t } from './i18n.ts';

  interface Props {
    project: WorkspaceState;
    snapshot: Snapshot;
  }
  let { project, snapshot }: Props = $props();

  const connection = $derived(
    snapshot.refreshing ? t('status.refreshing')
      : snapshot.stale ? t('status.stale')
        : snapshot.status === 'disconnected' ? t('status.disconnected')
          : snapshot.status === 'invalid-data' ? t('status.invalid')
            : snapshot.status === 'loading' ? t('status.loading')
              : t('status.connected'),
  );
  const pending = $derived([...snapshot.saves.values()].filter((save) => save.kind === 'pending').length);
  const problems = $derived(
    [...snapshot.saves].flatMap(([key, save]) =>
      save.kind === 'pending'
        ? []
        : [{ key, text: `${key.startsWith('new:') ? t('save.newBean') : key}: ${t(`save.${save.kind}`, { message: describeError(save.error) })}` }],
    ),
  );
</script>

<footer class="status">
  <span role="status">{connection}</span>
  <span role="status" class="saves">
    {#if pending > 0}{t('save.pending', { count: pending })}
    {:else if problems.length === 0 && snapshot.drafts.length === 0}{t('save.saved')}{/if}
    {#if snapshot.drafts.length > 0}{t('save.drafts', { count: snapshot.drafts.length })}{/if}
    {#if snapshot.draftsUnsaved}{t('save.draftsUnsaved')}{/if}
  </span>
  {#each problems as problem (problem.key)}
    <span class="problem" role="alert">
      {problem.text}
      <button type="button" onclick={() => { project.dismissSave(problem.key); }}>{t('action.dismiss')}</button>
    </span>
  {/each}
</footer>

<style>
  .status { display: flex; flex-wrap: wrap; gap: var(--size-4-4); align-items: center; padding: var(--size-4-1) var(--size-4-3); border-top: 1px solid var(--background-modifier-border); font-size: var(--font-ui-smaller); color: var(--text-muted); }
  .saves { margin-inline-start: auto; }
  .problem { flex-basis: 100%; color: var(--text-error); }
</style>
