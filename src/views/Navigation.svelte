<script lang="ts">
  import type { Vocabulary } from '../state/model.ts';
  import { NAV_GROUPS, type NavId } from '../state/navigation.ts';
  import { unmatchedValues, type ViewChange, type ViewContent, type ViewEntry, type ViewResult } from '../state/saved-views.ts';
  import { t } from './i18n.ts';

  interface Props {
    active: NavId;
    /** The applied saved view; when set it, not `active`, is the current entry. */
    activeView: string | null;
    onSelect: (id: NavId) => void;
    views: readonly ViewEntry[];
    vocabulary: Vocabulary;
    /** Every tag of the loaded project; undefined before the first load. */
    tags: ReadonlySet<string> | undefined;
    /** The filters and presentation on screen: what Save and Update store. */
    content: ViewContent;
    onApply: (id: string) => void;
    onChange: (change: ViewChange) => Promise<ViewResult>;
  }
  let { active, activeView, onSelect, views, vocabulary, tags, content, onApply, onChange }: Props = $props();

  /** The one entry being renamed or confirmed for removal. */
  let editing = $state.raw<{ readonly mode: 'rename' | 'remove'; readonly entry: ViewEntry } | undefined>();
  let name = $state('');
  let newName = $state('');
  let error = $state('');

  async function run(change: ViewChange): Promise<boolean> {
    const result = await onChange(change);
    error = result.ok ? '' : t(`saved.error.${result.reason}`);
    return result.ok;
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (await run({ kind: 'save', name: newName, content })) newName = '';
  }

  async function finish(): Promise<void> {
    const current = editing;
    if (current === undefined) return;
    const change: ViewChange | undefined =
      current.mode === 'remove' ? { kind: 'remove', entry: current.entry }
        : current.entry.kind === 'view' ? { kind: 'rename', id: current.entry.view.id, name }
          : undefined;
    if (change && (await run(change))) editing = undefined;
  }

  const edit = (mode: 'rename' | 'remove', entry: ViewEntry): void => {
    error = '';
    name = entry.kind === 'view' ? entry.view.name : '';
    editing = { mode, entry };
  };
</script>

<nav class="nav" aria-label={t('nav.label')}>
  {#each NAV_GROUPS as group (group.group)}
    <h3>{t(`nav.group.${group.group}`)}</h3>
    <ul>
      {#each group.ids as id (id)}
        <li>
          <button type="button" class="nav-item" aria-current={activeView === null && active === id ? 'page' : undefined} onclick={() => { onSelect(id); }}>
            {t(`nav.${id}`)}
          </button>
        </li>
      {/each}
    </ul>
  {/each}

  <h3>{t('nav.group.saved')}</h3>
  <ul aria-label={t('saved.list')}>
    {#each views as entry, at (entry.kind === 'view' ? entry.view.id : `invalid-${String(at)}`)}
      {#if entry.kind === 'view'}
        {@const { view } = entry}
        {@const unmatched = unmatchedValues(view, vocabulary, tags)}
        {@const current = activeView === view.id}
        <li>
          <button type="button" class="nav-item" aria-current={current ? 'page' : undefined} onclick={() => { onApply(view.id); }}>{view.name}</button>
          {#if unmatched.length > 0}<p class="hint warn">{t('saved.unmatched', { values: unmatched.join(', ') })}</p>{/if}
          {#if editing?.entry === entry && editing.mode === 'rename'}
            <form class="actions" onsubmit={(event) => { event.preventDefault(); void finish(); }}>
              <input type="text" aria-label={t('saved.name')} bind:value={name} />
              <button type="submit">{t('saved.rename')}</button>
              <button type="button" onclick={() => { editing = undefined; error = ''; }}>{t('action.cancel')}</button>
            </form>
          {:else if editing?.entry === entry}
            <div class="actions">
              <span>{t('saved.confirmRemove', { name: view.name })}</span>
              <button type="button" onclick={() => void finish()}>{t('saved.remove')}</button>
              <button type="button" onclick={() => { editing = undefined; }}>{t('action.cancel')}</button>
            </div>
          {:else if current}
            <div class="actions">
              <button type="button" onclick={() => void run({ kind: 'update', id: view.id, content })}>{t('saved.update')}</button>
              <button type="button" onclick={() => { edit('rename', entry); }}>{t('saved.rename')}</button>
              <button type="button" onclick={() => { edit('remove', entry); }}>{t('saved.remove')}</button>
            </div>
          {/if}
        </li>
      {:else}
        <li class="invalid">
          <p class="hint warn">{t(`saved.invalid.${entry.reason}`)}</p>
          {#if editing?.entry === entry}
            <div class="actions">
              <span>{t('saved.confirmRemoveInvalid')}</span>
              <button type="button" onclick={() => void finish()}>{t('saved.remove')}</button>
              <button type="button" onclick={() => { editing = undefined; }}>{t('action.cancel')}</button>
            </div>
          {:else}
            <div class="actions"><button type="button" onclick={() => { edit('remove', entry); }}>{t('saved.remove')}</button></div>
          {/if}
        </li>
      {/if}
    {:else}
      <li class="hint">{t('saved.none')}</li>
    {/each}
  </ul>
  <form class="actions" onsubmit={(event) => void save(event)}>
    <input type="text" aria-label={t('saved.name')} placeholder={t('saved.name')} bind:value={newName} />
    <button type="submit">{t('saved.save')}</button>
  </form>
  {#if error !== ''}<p class="hint error" role="alert">{error}</p>{/if}
</nav>

<style>
  .nav { padding: var(--size-4-2); overflow-y: auto; }
  h3 { margin: var(--size-4-3) 0 var(--size-4-1); font-size: var(--font-ui-smaller); font-weight: var(--font-semibold); text-transform: uppercase; color: var(--text-muted); }
  ul { margin: 0; padding: 0; list-style: none; }
  .nav-item { width: 100%; justify-content: flex-start; text-align: start; background: transparent; box-shadow: none; color: var(--text-normal); }
  .nav-item:hover { background: var(--background-modifier-hover); }
  .nav-item[aria-current='page'] { background: var(--background-modifier-active-hover); font-weight: var(--font-semibold); }
  .actions { display: flex; flex-wrap: wrap; gap: var(--size-4-1); align-items: center; margin: var(--size-4-1) 0; font-size: var(--font-ui-smaller); }
  .actions input { flex: 1; min-width: 5rem; }
  .hint { margin: var(--size-4-1) var(--size-4-2); font-size: var(--font-ui-smaller); color: var(--text-muted); }
  .warn { color: var(--text-warning); }
  .error { color: var(--text-error); }
</style>
