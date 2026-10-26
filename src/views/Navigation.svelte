<script lang="ts">
  import { NAV_GROUPS, type NavId } from '../state/navigation.ts';
  import { t } from './i18n.ts';

  interface Props {
    active: NavId;
    onSelect: (id: NavId) => void;
  }
  let { active, onSelect }: Props = $props();
</script>

<nav class="nav" aria-label={t('nav.label')}>
  {#each NAV_GROUPS as group (group.group)}
    <h3>{t(`nav.group.${group.group}`)}</h3>
    <ul>
      {#each group.ids as id (id)}
        <li>
          <button type="button" class="nav-item" aria-current={active === id ? 'page' : undefined} onclick={() => { onSelect(id); }}>
            {t(`nav.${id}`)}
          </button>
        </li>
      {/each}
    </ul>
  {/each}
</nav>

<style>
  .nav { padding: var(--size-4-2); overflow-y: auto; }
  h3 { margin: var(--size-4-3) 0 var(--size-4-1); font-size: var(--font-ui-smaller); font-weight: var(--font-semibold); text-transform: uppercase; color: var(--text-muted); }
  ul { margin: 0; padding: 0; list-style: none; }
  .nav-item { width: 100%; justify-content: flex-start; text-align: start; background: transparent; box-shadow: none; color: var(--text-normal); }
  .nav-item:hover { background: var(--background-modifier-hover); }
  .nav-item[aria-current='page'] { background: var(--background-modifier-active-hover); font-weight: var(--font-semibold); }
</style>
