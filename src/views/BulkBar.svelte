<script lang="ts">
  import { canHaveChildren } from '../state/relations.ts';
  import type { BulkEdit, Snapshot } from '../state/model.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import BeanPicker from './BeanPicker.svelte';
  import BulkResults from './BulkResults.svelte';
  import { t } from './i18n.ts';

  interface Props {
    project: WorkspaceState;
    snapshot: Snapshot;
  }
  let { project, snapshot }: Props = $props();

  const FIELDS = ['status', 'type', 'priority', 'parent'] as const;
  const LISTS = { status: 'statuses', type: 'types', priority: 'priorities' } as const;

  let field = $state<(typeof FIELDS)[number]>('status');
  let value = $state('');
  /** `undefined`: no parent chosen yet; `null`: "No parent". */
  let parent = $state<string | null | undefined>();
  let picking = $state(false);
  let reviewing = $state(false);

  const ids = $derived(snapshot.selection.ids);
  const run = $derived(snapshot.bulk);
  const edit = $derived<BulkEdit | undefined>(field === 'parent' ? (parent === undefined ? undefined : { field, parentId: parent }) : value === '' ? undefined : { field, value });
  const candidates = $derived(picking ? snapshot.beans.filter((bean) => canHaveChildren(bean.type) && !bean.problems.includes('duplicate-id')) : []);
  const byId = $derived(reviewing ? new Map(snapshot.beans.map((bean) => [bean.id, bean])) : new Map());
  const visible = $derived(new Set(snapshot.visible.map((bean) => bean.id)));
  const parentText = $derived(parent === undefined ? t('bulk.parentUnset') : parent === null ? t('parent.none') : parent);

  function chooseField(next: (typeof FIELDS)[number]): void {
    field = next;
    value = '';
    parent = undefined;
    picking = false;
  }
</script>

{#if ids.length > 0 || run}
  <div class="bulk" role="group" aria-label={t('bulk.label')}>
    {#if run}
      <BulkResults {project} {snapshot} {run} />
    {:else}
      <p class="target" role="status">{t('bulk.target', { count: ids.length, hidden: snapshot.selection.hidden })}</p>
      <div class="line">
        <label>
          {t('bulk.field')}
          <select value={field} onchange={(event) => { chooseField(event.currentTarget.value as (typeof FIELDS)[number]); }}>
            {#each FIELDS as one (one)}<option value={one}>{one === 'parent' ? t('inspector.parent') : t(`field.${one}`)}</option>{/each}
          </select>
        </label>
        {#if field === 'parent'}
          <button type="button" aria-expanded={picking} onclick={() => { picking = !picking; }}>{t('bulk.chooseParent', { parent: parentText })}</button>
        {:else}
          <label>
            {t('bulk.value')}
            <select bind:value>
              <option value="">{t('bulk.choose')}</option>
              {#each project.vocabulary[LISTS[field]] as one (one)}<option value={one}>{one}</option>{/each}
            </select>
          </label>
        {/if}
        <button type="button" class="apply" disabled={edit === undefined} onclick={() => { if (edit) void project.applyBulk(edit); }}>{t('bulk.apply', { count: ids.length })}</button>
      </div>
      {#if picking}
        <BeanPicker
          label={t('parent.pick')}
          {candidates}
          current={parent === undefined ? '' : parent}
          noneLabel={t('parent.none')}
          onPick={(id) => { parent = id; picking = false; }}
          onNone={() => { parent = null; picking = false; }}
          onCancel={() => { picking = false; }}
        />
      {/if}
      <details bind:open={reviewing}>
        <summary>{t('bulk.review', { count: ids.length })}</summary>
        <ul>
          {#each ids as id (id)}
            <li>
              <span class="id">{id}</span> {byId.get(id)?.title ?? ''}{visible.has(id) ? '' : ` (${t('bulk.hiddenOne')})`}
              <button type="button" onclick={() => { project.toggleSelected(id); }}>{t('bulk.deselect', { id })}</button>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  </div>
{/if}

<style>
  .bulk { border-bottom: 1px solid var(--background-modifier-border); }
  .target { margin: 0; padding: var(--size-4-2) var(--size-4-3) 0; font-weight: var(--font-semibold); font-size: var(--font-ui-small); }
  .line { display: flex; flex-wrap: wrap; gap: var(--size-4-2); align-items: center; padding: var(--size-4-2) var(--size-4-3); }
  .bulk :global(.picker) { margin-inline: var(--size-4-3); }
  details { padding: 0 var(--size-4-3) var(--size-4-2); font-size: var(--font-ui-small); }
  summary { cursor: pointer; }
  ul { max-height: 10rem; margin: var(--size-4-1) 0 0; padding: 0; overflow-y: auto; list-style: none; }
  .id { font-family: var(--font-monospace); font-size: var(--font-ui-smaller); color: var(--text-muted); }
</style>
