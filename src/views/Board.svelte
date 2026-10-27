<script lang="ts">
  import { boardModel } from '../state/board.ts';
  import type { BeanSummary, Snapshot } from '../state/model.ts';
  import type { WorkspaceState } from '../state/workspace-state.ts';
  import { t } from './i18n.ts';
  import type { Layout } from './layout.ts';
  import SaveFeedback from './SaveFeedback.svelte';

  interface Props {
    project: WorkspaceState;
    snapshot: Snapshot;
    sort: Layout['sort'];
    swimlanes: Layout['swimlanes'];
    onOpen: (id: string) => void;
    /** Sets the status of one bean through the shared mutation. Cross-status movement is the only thing the board writes. */
    onMove: (bean: BeanSummary, status: string) => Promise<void>;
    /** Applies the failed change again after a conflict, or undefined when there is nothing to apply. */
    overwrite: (id: string) => ((revision: string) => void) | undefined;
    /** Remembers the focused card, like the list does. */
    onFocus: (id: string) => void;
  }
  let { project, snapshot, sort, swimlanes, onOpen, onMove, overwrite, onFocus }: Props = $props();

  /** The card being dragged and the lane it started in. A card can only land in its own lane (design: Board swimlanes). */
  let dragging = $state<{ readonly id: string; readonly lane: string } | undefined>();

  const model = $derived(boardModel(snapshot.beans, snapshot.visible, sort, project.vocabulary, swimlanes));
  const selected = $derived(new Set(snapshot.selection.ids));

  const locked = (bean: BeanSummary): boolean => {
    const kind = snapshot.saves.get(bean.id)?.kind;
    return bean.problems.length > 0 || kind === 'pending' || kind === 'uncertain';
  };

  /** A pending save shows the status the user asked for, never as data: the card stays where it is until Beans confirms. */
  function intended(bean: BeanSummary): string {
    const save = snapshot.saves.get(bean.id);
    return save?.kind === 'pending' && 'kind' in save.intent && save.intent.kind === 'fields' ? (save.intent.status ?? bean.status) : bean.status;
  }

  async function choose(event: Event, bean: BeanSummary): Promise<void> {
    const select = event.currentTarget as HTMLSelectElement;
    await onMove(bean, select.value);
    // Unsaved means the cached status stands, so the picker must not keep showing the choice.
    select.value = project.getSnapshot().beans.find((one) => one.id === bean.id)?.status ?? select.value;
  }

  const droppable = (lane: string, status: string): boolean => {
    const card = dragging && snapshot.beans.find((one) => one.id === dragging?.id);
    return card !== undefined && dragging?.lane === lane && card.status !== status;
  };

  function over(event: DragEvent, lane: string, status: string): void {
    if (!droppable(lane, status)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  function drop(event: DragEvent, lane: string, status: string): void {
    event.preventDefault();
    const card = droppable(lane, status) ? snapshot.beans.find((one) => one.id === dragging?.id) : undefined;
    dragging = undefined;
    if (card) void onMove(card, status);
  }

  function start(event: DragEvent, bean: BeanSummary, lane: string): void {
    dragging = { id: bean.id, lane };
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', bean.id);
  }
</script>

<div class="board" role="group" aria-label={t('board.label')} style:--columns={model.statuses.length}>
  <div class="heads">
    {#each model.statuses as status, at (status)}
      <span class="head" title={t('board.column', { status, count: model.totals[at] ?? 0 })}>{status} <span class="count">{model.totals[at] ?? 0}</span></span>
    {/each}
  </div>
  {#each model.lanes as lane (lane.key)}
    <section class="lane" aria-label={lane.header ? (lane.parentId === null ? t('board.noParent') : t('board.lane', { parent: lane.parent?.title ?? lane.parentId })) : undefined}>
      <!-- A lane header is context: it has no checkbox and no row action, so it can never become a bulk target. -->
      {#if lane.header}
        <h3 class="lane-header">{lane.parentId === null ? t('board.noParent') : lane.parent ? `${lane.parent.title} (${lane.parent.id})` : lane.parentId}</h3>
      {/if}
      <div class="cells">
        {#each model.statuses as status, at (status)}
          <!-- Drop targets only accept a card from the same lane; the Move select is the keyboard alternative. -->
          <div
            class="cell"
            class:target={droppable(lane.key, status)}
            role="group"
            aria-label={t('board.column', { status, count: lane.cells[at]?.length ?? 0 })}
            ondragover={(event) => { over(event, lane.key, status); }}
            ondrop={(event) => { drop(event, lane.key, status); }}
          >
            <ul>
              {#each lane.cells[at] ?? [] as bean (bean.path)}
                {@const save = snapshot.saves.get(bean.id)}
                <li class="card" class:current={snapshot.selectedId === bean.id} class:dragged={dragging?.id === bean.id} draggable={!locked(bean)} ondragstart={(event) => { start(event, bean, lane.key); }} ondragend={() => { dragging = undefined; }}>
                  <div class="top">
                    <input type="checkbox" aria-label={t('row.select', { id: bean.id })} checked={selected.has(bean.id)} onchange={() => { project.toggleSelected(bean.id); }} />
                    <button
                      type="button"
                      class="row"
                      data-id={bean.id}
                      aria-current={snapshot.selectedId === bean.id ? 'true' : undefined}
                      onfocus={() => { onFocus(bean.id); }}
                      onclick={() => { onOpen(bean.id); }}
                    >
                      <span class="id">{bean.id}</span>
                      <span class="title">{bean.title}</span>
                    </button>
                  </div>
                  <div class="meta">{bean.type} · {bean.priority}</div>
                  <select
                    aria-label={t('board.move', { id: bean.id })}
                    title={bean.problems.length > 0 ? t('row.locked') : undefined}
                    disabled={locked(bean)}
                    value={intended(bean)}
                    onchange={(event) => void choose(event, bean)}
                  >
                    {#each model.statuses as one (one)}<option value={one}>{one}</option>{/each}
                  </select>
                  {#if save}
                    <SaveFeedback {project} saveKey={bean.id} {save} onOverwrite={overwrite(bean.id)} />
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .board { --column-min: 11rem; min-width: calc(var(--columns) * var(--column-min)); padding: var(--size-4-2) var(--size-4-3); }
  .heads, .cells { display: grid; grid-template-columns: repeat(var(--columns), minmax(var(--column-min), 1fr)); gap: var(--size-4-2); }
  .heads { position: sticky; top: 0; z-index: 1; padding-bottom: var(--size-4-1); background: var(--background-primary); font-weight: var(--font-semibold); font-size: var(--font-ui-small); }
  .count { color: var(--text-muted); font-weight: normal; }
  .lane { margin-top: var(--size-4-3); }
  .lane-header { margin: 0 0 var(--size-4-1); font-size: var(--font-ui-small); color: var(--text-muted); border-bottom: 1px solid var(--background-modifier-border); }
  .cell { min-height: 2.5rem; padding: var(--size-4-1); border-radius: var(--radius-m); background: var(--background-secondary); }
  .cell.target { outline: 2px dashed var(--interactive-accent); }
  ul { display: flex; flex-direction: column; gap: var(--size-4-1); margin: 0; padding: 0; list-style: none; }
  .card { display: flex; flex-direction: column; gap: var(--size-4-1); padding: var(--row-padding, var(--size-4-2)); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); background: var(--background-primary); }
  .card[draggable='true'] { cursor: grab; }
  .card.dragged { opacity: 0.5; }
  .top { display: flex; gap: var(--size-4-1); align-items: baseline; }
  .row { display: flex; flex-direction: column; flex: 1; min-width: 0; height: auto; align-items: flex-start; padding: 0; text-align: start; background: transparent; box-shadow: none; color: inherit; }
  .card.current { border-color: var(--interactive-accent); box-shadow: inset 3px 0 0 var(--interactive-accent); }
  .id { font-family: var(--font-monospace); font-size: var(--font-ui-smaller); color: var(--text-muted); }
  .title { overflow-wrap: anywhere; white-space: normal; }
  .meta { font-size: var(--font-ui-smaller); color: var(--text-muted); }
  select { font-size: var(--font-ui-smaller); }
</style>
