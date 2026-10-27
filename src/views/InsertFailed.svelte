<script lang="ts">
  import { t } from './i18n.ts';

  interface Props {
    reason: 'changed' | 'gone';
    /** The link that could not be written, so it can still be used by hand. */
    link: string;
    /** Tries the write again. Never creates anything. */
    onRetry: () => void;
  }
  let { reason, link, onRetry }: Props = $props();

  let note = $state('');

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      note = t('note.copied');
    } catch {
      note = t('copy.failed');
    }
  }
</script>

<div class="failed" role="alert">
  <p>{t(`note.${reason}`)}</p>
  <label for="insert-link">{t('note.linkLabel')}</label>
  <input id="insert-link" type="text" readonly value={link} onfocus={(event) => { event.currentTarget.select(); }} />
  <div class="buttons">
    <button type="button" onclick={onRetry}>{t('note.retry')}</button>
    <button type="button" onclick={() => void copy()}>{t('note.copyLink')}</button>
  </div>
  <p class="note" role="status">{note}</p>
</div>

<style>
  .failed { margin: var(--size-4-2) 0; }
  p { margin: 0 0 var(--size-4-2); }
  label { display: block; font-size: var(--font-ui-smaller); color: var(--text-muted); }
  input { width: 100%; margin-bottom: var(--size-4-2); font-family: var(--font-monospace); }
  .buttons { display: flex; flex-wrap: wrap; gap: var(--size-4-2); }
  .note { color: var(--text-muted); font-size: var(--font-ui-smaller); }
  .note:empty { display: none; }
</style>
