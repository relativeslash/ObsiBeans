import type { BeanSummary } from '../adapter/beans-model.ts';
import type { Filters, Vocabulary } from './model.ts';

/** English is the only locale (project info, LOC-TEXT-005); the system locale is ignored. Case-insensitive, accent-sensitive. */
const TITLES = new Intl.Collator('en', { sensitivity: 'accent' });

/** Position in a fixed list; a value the list does not know sorts last. */
const rank = (list: readonly string[], value: string): number => {
  const at = list.indexOf(value);
  return at < 0 ? list.length : at;
};

/**
 * The one deterministic order (Beans 0.4.2 contract): status, priority, type, case-insensitive title, then full ID.
 * Beans' own order changes between runs, so rows would jump on every refresh without this.
 */
export function orderBeans(beans: readonly BeanSummary[], vocabulary: Vocabulary): BeanSummary[] {
  return [...beans].sort(
    (a, b) =>
      rank(vocabulary.statuses, a.status) - rank(vocabulary.statuses, b.status) ||
      rank(vocabulary.priorities, a.priority) - rank(vocabulary.priorities, b.priority) ||
      rank(vocabulary.types, a.type) - rank(vocabulary.types, b.type) ||
      TITLES.compare(a.title, b.title) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Readiness as the backend defines it, computed once per load by the adapter. */
export interface Readiness {
  readonly blocked: ReadonlySet<string>;
  readonly ready: ReadonlySet<string>;
}

const any = (allowed: readonly string[], value: string): boolean => allowed.length === 0 || allowed.includes(value);

/**
 * Whether a bean passes the filters. Search is plain text: every word must occur in the title, ID, file name part or a tag.
 * Descriptions are not loaded for rows, so they are not searched here.
 */
export function matchesFilters(bean: BeanSummary, filters: Filters, readiness: Readiness): boolean {
  const words = filters.search.toLowerCase().split(/\s+/).filter((word) => word !== '');
  const haystack = [bean.title, bean.id, bean.slug, ...bean.tags].join('\n').toLowerCase();
  return (
    words.every((word) => haystack.includes(word)) &&
    any(filters.statuses, bean.status) &&
    any(filters.types, bean.type) &&
    any(filters.priorities, bean.priority) &&
    (filters.tags.length === 0 || bean.tags.some((tag) => filters.tags.includes(tag))) &&
    (filters.readiness === 'any' || (filters.readiness === 'ready' ? readiness.ready : readiness.blocked).has(bean.id))
  );
}
