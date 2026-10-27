import type { BeanSummary } from '../adapter/beans-model.ts';
import type { Filters, Row, Sort, SortKey, Vocabulary } from './model.ts';

/** English is the only locale (project info, LOC-TEXT-005); the system locale is ignored. Case-insensitive, accent-sensitive. */
export const TITLES = new Intl.Collator('en', { sensitivity: 'accent' });

/** Position in a fixed list; a value the list does not know sorts last. */
export const rank = (list: readonly string[], value: string): number => {
  const at = list.indexOf(value);
  return at < 0 ? list.length : at;
};

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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
      cmp(a.id, b.id),
  );
}

const COMPARE: Readonly<Record<Exclude<SortKey, 'default'>, (v: Vocabulary) => (a: BeanSummary, b: BeanSummary) => number>> = {
  id: () => (a, b) => cmp(a.id, b.id),
  title: () => (a, b) => TITLES.compare(a.title, b.title),
  status: (v) => (a, b) => rank(v.statuses, a.status) - rank(v.statuses, b.status),
  type: (v) => (a, b) => rank(v.types, a.type) - rank(v.types, b.type),
  priority: (v) => (a, b) => rank(v.priorities, a.priority) - rank(v.priorities, b.priority),
  updated: () => (a, b) => cmp(a.updatedAt, b.updatedAt),
};

/**
 * Re-sorts beans already in the default order. The sort is stable, so equal keys keep that order (ending in the full
 * ID) in both directions and rows do not jump. Sorting is client-side: Beans' own order is not stable.
 */
export function sortBeans(beans: readonly BeanSummary[], sort: Sort, vocabulary: Vocabulary): readonly BeanSummary[] {
  if (sort.key === 'default') return sort.descending ? [...beans].reverse() : beans;
  const compare = COMPARE[sort.key](vocabulary);
  const sign = sort.descending ? -1 : 1;
  return [...beans].sort((a, b) => sign * compare(a, b));
}

/**
 * The rows to draw: the matches plus the ancestors of each match as context rows, in one sorted list. `all` is the
 * whole project in default order and `visible` the matches. Identity (not ID) tells matches apart, so a duplicate ID
 * cannot turn a context row into a match.
 */
export function listRows(all: readonly BeanSummary[], visible: readonly BeanSummary[], sort: Sort, vocabulary: Vocabulary): Row[] {
  const byId = new Map(all.map((bean) => [bean.id, bean]));
  const matched = new Set(visible);
  const context = new Set<BeanSummary>();
  for (const bean of visible) {
    const seen = new Set([bean]);
    for (let parent = byId.get(bean.parentId ?? ''); parent && !seen.has(parent); parent = byId.get(parent.parentId ?? '')) {
      seen.add(parent);
      if (!matched.has(parent)) context.add(parent);
    }
  }
  const shown = all.filter((bean) => matched.has(bean) || context.has(bean));
  return sortBeans(shown, sort, vocabulary).map((bean) => ({ bean, context: !matched.has(bean) }));
}

/** Every tag with the number of beans carrying it, by name. */
export function tagCounts(beans: readonly BeanSummary[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const bean of beans) for (const tag of new Set(bean.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => cmp(a, b));
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
