import type { BeanSummary } from '../adapter/beans-model.ts';
import type { Draft, DraftEntry, DraftKind, Restoration } from './model.ts';

/** Stored drafts are bounded so a damaged or hostile data file cannot grow memory without limit. */
export const MAX_DRAFTS = 200;
export const MAX_DRAFT_CHARS = 1_000_000;

const KINDS: readonly string[] = ['description', 'creation'];

const same = (a: Draft, kind: DraftKind, key: string): boolean => a.kind === kind && a.key === key;

/**
 * Reads the stored `drafts` value entry by entry. An entry without a known kind, key and text cannot be shown
 * to the user, so it is skipped; everything else survives, even when its neighbours are damaged.
 */
export function parseDrafts(stored: unknown): Draft[] {
  if (!Array.isArray(stored)) return [];
  const drafts: Draft[] = [];
  for (const raw of stored.slice(0, MAX_DRAFTS) as unknown[]) {
    const entry = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    const { kind, key, text, revision, savedAt } = entry;
    if (typeof kind !== 'string' || !KINDS.includes(kind) || typeof key !== 'string' || key === '' || typeof text !== 'string') continue;
    if (drafts.some((draft) => same(draft, kind as DraftKind, key))) continue;
    drafts.push({
      kind: kind as DraftKind,
      key,
      text: text.slice(0, MAX_DRAFT_CHARS),
      revision: typeof revision === 'string' ? revision : null,
      savedAt: typeof savedAt === 'string' ? savedAt : '',
    });
  }
  return drafts;
}

/** Replaces the draft with the same kind and key, or adds it. A full list refuses a new key rather than dropping text. */
export function upsertDraft(drafts: readonly Draft[], draft: Draft): Draft[] | undefined {
  const exists = drafts.some((other) => same(other, draft.kind, draft.key));
  if (!exists && drafts.length >= MAX_DRAFTS) return undefined;
  return exists ? drafts.map((other) => (same(other, draft.kind, draft.key) ? draft : other)) : [...drafts, draft];
}

export const removeDraft = (drafts: readonly Draft[], kind: DraftKind, key: string): Draft[] => drafts.filter((draft) => !same(draft, kind, key));

/** A draft against the project as last loaded; `beans` is undefined before the first load. */
export function classify(draft: Draft, beans: ReadonlyMap<string, BeanSummary> | undefined): DraftEntry {
  if (draft.kind === 'creation') return { draft, status: 'current' };
  if (beans === undefined) return { draft, status: 'unchecked' };
  const bean = beans.get(draft.key);
  return { draft, status: bean === undefined ? 'orphaned' : bean.revision === draft.revision ? 'current' : 'changed' };
}

/** Restore only overwrites nothing: a changed bean opens conflict review, a missing one keeps the text for copying. */
export function restoration(draft: Draft, beans: ReadonlyMap<string, BeanSummary> | undefined): Restoration {
  const { status } = classify(draft, beans);
  if (status === 'unchecked') return { kind: 'unavailable' };
  const current = beans?.get(draft.key);
  if (status === 'orphaned') return { kind: 'orphaned', draft };
  return status === 'changed' && current ? { kind: 'conflict', draft, current } : { kind: 'restore', draft };
}
