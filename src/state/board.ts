import type { BeanSummary } from '../adapter/beans-model.ts';
import { sortBeans } from './filters.ts';
import type { Sort, Vocabulary } from './model.ts';

/** Board columns are the five real Beans statuses in workflow order (design: Work views). */
const WORKFLOW = ['draft', 'todo', 'in-progress', 'completed', 'scrapped'] as const;

export type Swimlanes = 'none' | 'parent';

export interface Lane {
  /** Identity of the lane: the parent's full ID, or `''` for beans without a parent (and for the single lane without swimlanes). */
  readonly key: string;
  /** Whether the lane has a header. Without swimlanes there is one lane and no header. */
  readonly header: boolean;
  /** The parent bean; undefined for "No parent" and for a parent ID that no bean has. Context only, never a selection target. */
  readonly parent: BeanSummary | undefined;
  readonly parentId: string | null;
  /** One entry per board column, in column order. */
  readonly cells: readonly (readonly BeanSummary[])[];
}

export interface BoardModel {
  readonly statuses: readonly string[];
  /** Matches per column across all lanes: the filtered count. */
  readonly totals: readonly number[];
  readonly lanes: readonly Lane[];
}

/**
 * Cards are the matches only; parent context rows of the list never appear. Cards sort by `sort` in the list's
 * deterministic order, so same-column order is never a persisted arrangement. Lanes follow their parents' position
 * in the default order, then parents no bean has (by ID), then "No parent". Lanes without cards are left out.
 */
export function boardModel(all: readonly BeanSummary[], visible: readonly BeanSummary[], sort: Sort, vocabulary: Vocabulary, swimlanes: Swimlanes): BoardModel {
  // A status outside the five is shown as an extra column rather than hiding its beans.
  const extra = [...vocabulary.statuses, ...visible.map((bean) => bean.status)].filter((status, at, list) => !WORKFLOW.some((one) => one === status) && list.indexOf(status) === at);
  const statuses = [...WORKFLOW, ...extra];
  const sorted = sortBeans(visible, sort, vocabulary);
  const byId = new Map(all.map((bean) => [bean.id, bean]));
  const keyOf = (bean: BeanSummary): string => (swimlanes === 'parent' ? (bean.parentId ?? '') : '');

  const keys = [...new Set(sorted.map(keyOf))];
  const position = (key: string): number => {
    const parent = byId.get(key);
    return key === '' ? Infinity : parent ? all.indexOf(parent) : all.length;
  };
  keys.sort((a, b) => position(a) - position(b) || (a < b ? -1 : a > b ? 1 : 0));

  const lanes = keys.map((key): Lane => ({
    key,
    header: swimlanes === 'parent',
    parent: byId.get(key),
    parentId: key === '' ? null : key,
    cells: statuses.map((status) => sorted.filter((bean) => keyOf(bean) === key && bean.status === status)),
  }));
  return { statuses, totals: statuses.map((status) => visible.filter((bean) => bean.status === status).length), lanes };
}
