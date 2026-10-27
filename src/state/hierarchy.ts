import type { BeanSummary } from '../adapter/beans-model.ts';
import { listRows } from './filters.ts';
import type { Row, Sort, Vocabulary } from './model.ts';
import { ancestry, descendantIds, inBlockingCycle } from './relations.ts';

/** Leaf counts below one parent (design: Progress counting). Always over the whole project, never the filtered view. */
export interface Progress {
  readonly completed: number;
  readonly scrapped: number;
  /** Leaves that are neither completed nor scrapped. */
  readonly open: number;
  /** `none`: no leaf below ("No child work", never 0 % or 100 %). `all-scrapped`: every leaf is scrapped. */
  readonly kind: 'none' | 'all-scrapped' | 'counted';
  /** Completed over leaves that are not scrapped, rounded down so 100 means done. 0 unless `counted`. */
  readonly percent: number;
}

/**
 * Progress for every bean that has children. A leaf is a descendant, at any depth, that has no children of its own;
 * intermediate parents and the parent itself are not counted. Traversal is bounded (`descendantIds` visits each bean
 * once), so a parent loop or a missing parent cannot hang it.
 */
// ponytail: one descendant walk per parent, O(parents x beans); a bottom-up pass if projects grow far past thousands of beans.
export function progressByBean(beans: readonly BeanSummary[]): ReadonlyMap<string, Progress> {
  const parents = new Set(beans.map((bean) => bean.parentId));
  const byId = new Map(beans.map((bean) => [bean.id, bean]));
  const result = new Map<string, Progress>();
  for (const id of parents) {
    if (id === null || !byId.has(id)) continue;
    let completed = 0;
    let scrapped = 0;
    let open = 0;
    for (const below of descendantIds(beans, id)) {
      if (below === id || parents.has(below)) continue;
      const status = byId.get(below)?.status;
      if (status === 'completed') completed += 1;
      else if (status === 'scrapped') scrapped += 1;
      else open += 1;
    }
    const counted = completed + open;
    const kind = completed + scrapped + open === 0 ? 'none' : counted === 0 ? 'all-scrapped' : 'counted';
    result.set(id, { completed, scrapped, open, kind, percent: counted === 0 ? 0 : Math.floor((100 * completed) / counted) });
  }
  return result;
}

export interface Blockers {
  /** Existing beans that are neither completed nor scrapped and block this one, from either storage direction (BC-38). */
  readonly ids: readonly string[];
  /** This bean is part of a blocking loop already in the stored data. */
  readonly loop: boolean;
}

/** Open blockers per bean that has any. A blocker that does not exist does not block. */
export function blockersByBean(beans: readonly BeanSummary[]): ReadonlyMap<string, Blockers> {
  const byId = new Map(beans.map((bean) => [bean.id, bean]));
  const ids = new Map<string, Set<string>>();
  const add = (blocked: string, blocker: string): void => {
    const status = byId.get(blocker)?.status;
    if (status !== undefined && status !== 'completed' && status !== 'scrapped') ids.set(blocked, (ids.get(blocked) ?? new Set<string>()).add(blocker));
  };
  for (const bean of beans) {
    for (const target of bean.blockingIds) add(target, bean.id);
    for (const source of bean.blockedByIds) add(bean.id, source);
  }
  return new Map([...ids].map(([id, set]) => [id, { ids: [...set].sort(), loop: inBlockingCycle(beans, id) }]));
}

/** A top-level row whose stored parent is unusable: shown at the top so it can be found and fixed, never hidden. */
export type HierarchyProblem = { readonly kind: 'missing-parent'; readonly id: string } | { readonly kind: 'loop' };

export interface HierarchyRow {
  readonly bean: BeanSummary;
  readonly depth: number;
  /** An ancestor shown only for matching descendants: not a match, never counted or selected implicitly. */
  readonly context: boolean;
  /** Shown children under this row (matches and their ancestors only while filters hide the rest). */
  readonly children: number;
  readonly expanded: boolean;
  readonly problem: HierarchyProblem | null;
}

/**
 * The tree to draw. Rows are the matches plus their ancestors (`listRows`), each level in the chosen sort. A parent is
 * open when the user chose so by full bean ID, and otherwise while filters hide beans (so matches are not buried under
 * a closed parent) and closed when nothing is filtered. Beans whose parent is missing, or that sit in a parent loop,
 * become top-level rows with a `problem`; every bean is drawn once, so loops and duplicate IDs cannot repeat or hang.
 */
export function hierarchyRows(all: readonly BeanSummary[], visible: readonly BeanSummary[], sort: Sort, vocabulary: Vocabulary, expanded: ReadonlyMap<string, boolean>): HierarchyRow[] {
  const shown = listRows(all, visible, sort, vocabulary);
  const filtered = visible.length < all.length;
  const shownIds = new Set(shown.map((row) => row.bean.id));
  const kids = new Map<string, Row[]>();
  const roots: Row[] = [];
  for (const row of shown) {
    const parent = row.bean.parentId;
    if (parent !== null && shownIds.has(parent)) kids.set(parent, [...(kids.get(parent) ?? []), row]);
    else roots.push(row);
  }

  // Beans in a parent loop have a parent, so none is a root: promote the first of each loop, in sorted order.
  const reached = new Set<BeanSummary>();
  const mark = (start: Row): void => {
    for (let todo = [start], next = todo.pop(); next; next = todo.pop()) {
      if (reached.has(next.bean)) continue;
      reached.add(next.bean);
      todo.push(...(kids.get(next.bean.id) ?? []));
    }
  };
  roots.forEach(mark);
  for (const row of shown) {
    if (reached.has(row.bean)) continue;
    roots.push(row);
    mark(row);
  }

  const problemOf = (bean: BeanSummary): HierarchyProblem | null => {
    if (bean.parentId === null) return null;
    const above = ancestry(all, bean.id);
    return above.loop ? { kind: 'loop' } : above.missingId === undefined ? null : { kind: 'missing-parent', id: above.missingId };
  };

  const out: HierarchyRow[] = [];
  const seen = new Set<BeanSummary>();
  const stack = roots.map((row) => ({ row, depth: 0 })).reverse();
  for (let next = stack.pop(); next; next = stack.pop()) {
    const { row, depth } = next;
    if (seen.has(row.bean)) continue;
    seen.add(row.bean);
    const children = (kids.get(row.bean.id) ?? []).filter((kid) => !seen.has(kid.bean));
    const open = children.length > 0 && (expanded.get(row.bean.id) ?? filtered);
    out.push({ bean: row.bean, depth, context: row.context, children: children.length, expanded: open, problem: depth === 0 ? problemOf(row.bean) : null });
    if (open) for (const kid of [...children].reverse()) stack.push({ row: kid, depth: depth + 1 });
  }
  return out;
}
