<script lang="ts">
  import { retryable } from '../state/bulk.ts';
  import type { BulkRun, Snapshot } from '../state/model.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import { describeError } from './errors.ts';
  import { t } from './i18n.ts';

  interface Props {
    project: WorkspaceState;
    snapshot: Snapshot;
    run: BulkRun;
  }
  let { project, snapshot, run }: Props = $props();

  const count = (...kinds: string[]): number => run.items.filter((item) => kinds.includes(item.kind)).length;
  const titles = $derived(new Map(snapshot.beans.map((bean) => [bean.id, bean.title])));
  const problems = $derived(run.items.filter((item) => item.kind === 'failed' || item.kind === 'conflict' || item.kind === 'uncertain' || item.kind === 'skipped'));
  const retryCount = $derived(run.items.filter(retryable).length);
  const value = $derived(run.edit.field === 'parent' ? (run.edit.parentId ?? t('parent.none')) : run.edit.value);
  const field = $derived(run.edit.field === 'parent' ? t('inspector.parent') : t(`field.${run.edit.field}`));
</script>

<section class="results" aria-label={t('bulk.results')}>
  <p class="edit">{t('bulk.edit', { field, value })}</p>
  <p role="status">
    {t('bulk.summary', { saved: count('saved'), unchanged: count('unchanged'), problems: problems.length, waiting: count('pending', 'running'), cancelled: count('cancelled') })}
  </p>
  {#if run.phase === 'cancelling'}<p role="status">{t('bulk.cancelling')}</p>{/if}
  {#if run.rereadFailed}<p role="alert" class="problem">{t('bulk.rereadFailed')}</p>{/if}
  {#if problems.length > 0}
    <ul>
      {#each problems as item (item.id)}
        <li>
          <span class="id">{item.id}</span> {titles.get(item.id) ?? ''}:
          <span class="problem">{item.kind === 'skipped' ? t(`bulk.skipped.${item.reason}`) : describeError(item.error)}</span>
          {#if item.kind === 'uncertain'}
            {#if item.checked}
              <span>{t('bulk.checked')}</span>
            {:else}
              <button type="button" disabled={run.phase !== 'done'} onclick={() => { project.reconcileBulk(item.id); }}>{t('save.reconciled')}</button>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <div class="buttons">
    {#if run.phase === 'running'}
      <button type="button" onclick={() => { project.cancelBulk(); }}>{t('bulk.cancel')}</button>
    {:else if run.phase === 'done'}
      <button type="button" disabled={retryCount === 0} onclick={() => void project.retryBulk()}>{t('bulk.retry', { count: retryCount })}</button>
      <button type="button" onclick={() => { project.dismissBulk(); }}>{t('bulk.close')}</button>
    {/if}
  </div>
</section>

<style>
  .results { padding: var(--size-4-2) var(--size-4-3); border-bottom: 1px solid var(--background-modifier-border); }
  p { margin: 0 0 var(--size-4-1); font-size: var(--font-ui-small); }
  .edit { font-weight: var(--font-semibold); }
  ul { margin: 0 0 var(--size-4-2); padding: 0; max-height: 10rem; overflow-y: auto; list-style: none; font-size: var(--font-ui-small); }
  .id { font-family: var(--font-monospace); font-size: var(--font-ui-smaller); color: var(--text-muted); }
  .problem { color: var(--text-error); }
  .buttons { display: flex; flex-wrap: wrap; gap: var(--size-4-2); }
</style>
