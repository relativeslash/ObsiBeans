import type { BeanSummary, Change } from './model.ts';
import { TITLES, rank } from './filters.ts';

/**
 * Which parent types Beans accepts for each type (observed on 0.4.2 and a development build by
 * `test/adapter/beans-adapter-release.test.ts`). It only filters pickers and explains rejections early; Beans stays
 * the authority and still validates every write.
 */
export const PARENT_TYPES: Readonly<Record<string, readonly string[]>> = {
  milestone: [],
  epic: ['milestone'],
  feature: ['milestone', 'epic'],
  task: ['milestone', 'epic', 'feature'],
  bug: ['milestone', 'epic', 'feature'],
};

const parentsOf = (type: string): readonly string[] | undefined => PARENT_TYPES[type];

/** The beans above `id`, root first. Bounded: a loop in stored data stops the walk and is reported. */
export interface Ancestry {
  readonly chain: readonly BeanSummary[];
  /** The stored parents loop back on themselves. */
  readonly loop: boolean;
  /** The first parent ID that names no existing bean. */
  readonly missingId: string | undefined;
}

export function ancestry(beans: readonly BeanSummary[], id: string): Ancestry {
  const byId = new Map(beans.map((bean) => [bean.id, bean]));
  const seen = new Set([id]);
  const chain: BeanSummary[] = [];
  let next = byId.get(id)?.parentId ?? null;
  while (next !== null) {
    const bean = byId.get(next);
    if (!bean) return { chain: chain.reverse(), loop: false, missingId: next };
    if (seen.has(next)) return { chain: chain.reverse(), loop: true, missingId: undefined };
    seen.add(next);
    chain.push(bean);
    next = bean.parentId;
  }
  return { chain: chain.reverse(), loop: false, missingId: undefined };
}

/** Every bean below `id`, found from the stored parent links, whatever `childIds` says. */
export function descendantIds(beans: readonly BeanSummary[], id: string): ReadonlySet<string> {
  const children = new Map<string, string[]>();
  for (const bean of beans) if (bean.parentId !== null) children.set(bean.parentId, [...(children.get(bean.parentId) ?? []), bean.id]);
  const found = new Set<string>();
  const todo = [id];
  for (let next = todo.pop(); next !== undefined; next = todo.pop()) {
    for (const child of children.get(next) ?? []) if (!found.has(child)) { found.add(child); todo.push(child); }
  }
  return found;
}

/** Candidate parents: a milestone has none; everything else may pick from beans of an allowed type, outside its own subtree. */
export type ParentChoices = { readonly kind: 'none-possible' } | { readonly kind: 'options'; readonly beans: readonly BeanSummary[] };

export function eligibleParents(beans: readonly BeanSummary[], bean: BeanSummary, typeOrder: readonly string[]): ParentChoices {
  const allowed = parentsOf(bean.type) ?? [];
  if (allowed.length === 0) return { kind: 'none-possible' };
  const below = descendantIds(beans, bean.id);
  const options = beans
    .filter((other) => other.id !== bean.id && !below.has(other.id) && allowed.includes(other.type))
    .sort((a, b) => rank(typeOrder, a.type) - rank(typeOrder, b.type) || TITLES.compare(a.title, b.title) || (a.id < b.id ? -1 : 1));
  return { kind: 'options', beans: options };
}

/** The types a bean may not change to, each with the reason: its parent or one of its children would be invalid. */
export function typeBlockers(beans: readonly BeanSummary[], bean: BeanSummary, types: readonly string[]): ReadonlyMap<string, string> {
  const parent = beans.find((other) => other.id === bean.parentId);
  const children = beans.filter((other) => other.parentId === bean.id);
  const blocked = new Map<string, string>();
  for (const type of types) {
    if (type === bean.type || !parentsOf(type)) continue;
    const child = children.find((one) => !parentsOf(one.type)?.includes(type));
    const reason =
      parent && !parentsOf(type)?.includes(parent.type)
        ? `A ${type} cannot be under ${parent.id}, which is a ${parent.type}.`
        : child
          ? `${child.id} is a ${child.type} and cannot be under a ${type}.`
          : undefined;
    if (reason !== undefined) blocked.set(type, reason);
  }
  return blocked;
}

/** Every "blocks" edge, from both storage directions (BC-37): `from` blocks each of its targets. */
function blockEdges(beans: readonly BeanSummary[]): ReadonlyMap<string, ReadonlySet<string>> {
  const edges = new Map<string, Set<string>>();
  const add = (from: string, to: string): void => {
    edges.set(from, (edges.get(from) ?? new Set<string>()).add(to));
  };
  for (const bean of beans) {
    for (const target of bean.blockingIds) add(bean.id, target);
    for (const source of bean.blockedByIds) add(source, bean.id);
  }
  return edges;
}

/** Whether `to` can be reached from `from` along at least one edge. Each bean is visited once, so loops in the data cannot hang it. */
function reaches(edges: ReadonlyMap<string, ReadonlySet<string>>, from: string, to: string): boolean {
  const seen = new Set<string>();
  const todo = [from];
  for (let next = todo.pop(); next !== undefined; next = todo.pop()) {
    for (const target of edges.get(next) ?? []) {
      if (target === to) return true;
      if (!seen.has(target)) { seen.add(target); todo.push(target); }
    }
  }
  return false;
}

/** The bean is part of a blocking loop that already exists in the stored data. */
export const inBlockingCycle = (beans: readonly BeanSummary[], id: string): boolean => reaches(blockEdges(beans), id, id);

/**
 * Beans checks cycles within one storage direction only (BC-35), so a loop that mixes `blocking` and `blocked_by`
 * is accepted by Beans and by `beans check` (BC-36). This catches it before sending. It sees the last loaded data;
 * an edit made elsewhere in the meantime can still slip through.
 */
export function localProblem(beans: readonly BeanSummary[], id: string, change: Change, types: readonly string[]): string | undefined {
  const bean = beans.find((other) => other.id === id);
  if (!bean) return undefined;
  if (change.kind === 'fields' && change.type !== undefined) return typeBlockers(beans, bean, types).get(change.type);
  if (change.kind === 'blocking' && change.action === 'add') {
    // `blocking` adds id -> target; `blocked-by` adds target -> id. A cycle appears when the new edge's end reaches its start.
    const [from, to] = change.field === 'blocking' ? [id, change.targetId] : [change.targetId, id];
    if (reaches(blockEdges(beans), to, from)) return `${from} would block ${to}, which already depends on ${from} directly or through other beans.`;
  }
  return undefined;
}

export type LinkDirection = 'blocks' | 'blockedBy';

/**
 * The writes that make `id` stop blocking `otherId` (`blocks`) or stop waiting for it (`blockedBy`). A link lives in
 * the file that stores it, either side's, and only that field can remove it (BC-37), so there is usually one write
 * and two when both files store it.
 */
export function removalPlan(beans: readonly BeanSummary[], id: string, direction: LinkDirection, otherId: string): readonly { readonly id: string; readonly change: Change }[] {
  const me = beans.find((bean) => bean.id === id);
  const other = beans.find((bean) => bean.id === otherId);
  const [blocker, blocked] = direction === 'blocks' ? [id, otherId] : [otherId, id];
  const plan: { id: string; change: Change }[] = [];
  const source = direction === 'blocks' ? me : other;
  const target = direction === 'blocks' ? other : me;
  if (source?.blockingIds.includes(blocked)) plan.push({ id: blocker, change: { kind: 'blocking', field: 'blocking', action: 'remove', targetId: blocked } });
  if (target?.blockedByIds.includes(blocker)) plan.push({ id: blocked, change: { kind: 'blocking', field: 'blocked-by', action: 'remove', targetId: blocker } });
  return plan;
}

/** The write that makes `id` block `otherId` (`blocks`) or wait for it (`blockedBy`), stored in `id`'s own file. */
export const additionOf = (direction: LinkDirection, otherId: string): Change => ({
  kind: 'blocking',
  field: direction === 'blocks' ? 'blocking' : 'blocked-by',
  action: 'add',
  targetId: otherId,
});

/** Whether Beans accepts any type as a child of `type`. */
export const canHaveChildren = (type: string): boolean => Object.values(PARENT_TYPES).some((parents) => parents.includes(type));
