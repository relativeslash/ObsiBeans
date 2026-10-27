<script lang="ts">
  import { additionOf, inBlockingCycle, removalPlan, type LinkDirection } from '../state/relations.ts';
  import { relationsOf, type Related } from '../state/navigation.ts';
  import type { BeanSummary, Change, Snapshot } from '../state/model.ts';
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

  const SECTIONS = [
    ['blockedBy', 'inspector.blockedBy', 'links.addBlockedBy', 'links.pickBlockedBy'],
    ['blocks', 'inspector.blocks', 'links.addBlocks', 'links.pickBlocks'],
  ] as const;

  let picking = $state<LinkDirection | undefined>();
  /** The beans whose writes this component started, so their results show here. A removal can touch the other bean's file too. */
  let involved = $state<readonly string[]>([]);
  let done = $state<'added' | 'removed' | undefined>();

  const save = $derived(snapshot.saves.get(bean.id));
  const locked = $derived(bean.problems.length > 0 || save?.kind === 'pending' || save?.kind === 'uncertain');
  const relations = $derived(relationsOf(snapshot.beans, bean.id));
  const looped = $derived(inBlockingCycle(snapshot.beans, bean.id));
  const results = $derived(involved.flatMap((id) => { const one = snapshot.saves.get(id); return one ? [[id, one] as const] : []; }));

  /** Opens the picker for a bean this one blocks (the TUI's `b`, which edits the `blocking` field). */
  export function openBlocks(): void {
    if (!locked) picking = 'blocks';
  }

  /** Runs the writes in order and stops at the first that does not save, so a failure never leaves a later step applied. */
  async function run(steps: readonly { readonly id: string; readonly change: Change }[], outcome: 'added' | 'removed'): Promise<void> {
    picking = undefined;
    involved = steps.map((step) => step.id);
    done = undefined;
    for (const step of steps) if ((await project.mutate(step.id, step.change)).kind !== 'saved') return;
    done = outcome;
  }

  const remove = (direction: LinkDirection, other: Related): Promise<void> =>
    run(removalPlan(snapshot.beans, bean.id, direction, other.id), 'removed');

  /** Beans that can still be added: not this bean, not already linked in this direction, not ambiguous. */
  function candidates(direction: LinkDirection): BeanSummary[] {
    const linked = new Set((relations?.[direction] ?? []).map((one) => one.id));
    return snapshot.beans.filter((one) => one.id !== bean.id && !linked.has(one.id) && !one.problems.includes('duplicate-id'));
  }
</script>

{#if looped}<p class="note" role="status">{t('links.cycle')}</p>{/if}
{#each SECTIONS as [direction, heading, add, pick] (direction)}
  <section aria-labelledby="links-{direction}-{bean.id}">
    <h3 id="links-{direction}-{bean.id}">{t(heading)}</h3>
    {#if !relations || relations[direction].length === 0}
      <p class="note">{t('inspector.noneRelated')}</p>
    {:else}
      <ul>
        {#each relations[direction] as related (related.id)}
          <li>
            {#if related.bean}
              <button type="button" class="link" onclick={() => { onOpen(related.id); }}><span class="id">{related.id}</span> {related.bean.title}</button>
            {:else}
              <span class="id">{t('inspector.missing', { id: related.id })}</span>
            {/if}
            <button type="button" disabled={locked} aria-label={t('links.remove', { id: related.id })} onclick={() => void remove(direction, related)}>{t('links.removeShort')}</button>
          </li>
        {/each}
      </ul>
    {/if}
    <button type="button" disabled={locked} aria-expanded={picking === direction} onclick={() => { picking = picking === direction ? undefined : direction; }}>{t(add)}</button>
    {#if picking === direction}
      <BeanPicker
        label={t(pick)}
        candidates={candidates(direction)}
        onPick={(id) => void run([{ id: bean.id, change: additionOf(direction, id) }], 'added')}
        onCancel={() => { picking = undefined; }}
      />
    {/if}
  </section>
{/each}
{#each results as [id, result] (id)}
  <SaveFeedback {project} saveKey={id} save={result} />
{/each}
{#if done && results.length === 0}<p class="note" role="status">{done === 'added' ? t('links.added') : t('links.removed')}</p>{/if}

<style>
  h3 { margin: var(--size-4-4) 0 var(--size-4-1); font-size: var(--font-ui-small); text-transform: uppercase; color: var(--text-muted); }
  ul { margin: 0 0 var(--size-4-2); padding: 0; list-style: none; }
  li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--size-4-2); }
  .note { margin: 0 0 var(--size-4-2); color: var(--text-muted); }
  .id { font-family: var(--font-monospace); font-size: var(--font-ui-smaller); color: var(--text-muted); }
  .link { height: auto; padding: var(--size-4-1) var(--size-4-2); background: transparent; box-shadow: none; color: var(--text-accent); text-align: start; }
  .link:hover { text-decoration: underline; }
</style>
