import type { BeanSummary } from '../adapter/beans-model.ts';
import { DEFAULT_FILTERS, type Filters } from './model.ts';

/** The built-in navigation entries. Each is a fixed filter set, so every view and count agrees on what it means. */
export const NAV_IDS = ['all', 'ready', 'in-progress', 'blocked', 'milestones', 'epics'] as const;
export type NavId = (typeof NAV_IDS)[number];

export const NAV_GROUPS: readonly { readonly group: 'work' | 'planning'; readonly ids: readonly NavId[] }[] = [
  { group: 'work', ids: ['all', 'ready', 'in-progress', 'blocked'] },
  { group: 'planning', ids: ['milestones', 'epics'] },
];

/** Readiness uses the backend's meaning (`Readiness` in filters.ts), never the visible status column. */
const NAV_FILTERS: Readonly<Record<NavId, Partial<Filters>>> = {
  all: {},
  ready: { readiness: 'ready' },
  'in-progress': { statuses: ['in-progress'] },
  blocked: { readiness: 'blocked' },
  milestones: { types: ['milestone'] },
  epics: { types: ['epic'] },
};

/** A stored value that is not a known entry falls back to All work. */
export const parseNavId = (value: unknown): NavId => NAV_IDS.find((id) => id === value) ?? 'all';

/** The complete filter set of an entry. It replaces every other filter, so the entry is what the list shows. */
export const navFilters = (id: NavId): Filters => ({ ...DEFAULT_FILTERS, ...NAV_FILTERS[id] });

/** A related bean. `bean` is undefined when the link points at a bean that does not exist. */
export interface Related {
  readonly id: string;
  readonly bean: BeanSummary | undefined;
}

export interface Relations {
  readonly parent: Related | undefined;
  readonly children: readonly Related[];
  readonly blockedBy: readonly Related[];
  readonly blocks: readonly Related[];
}

/**
 * Parent, children and both blocker directions of one bean. Beans stores a blocking link on either side (`blocking`
 * here, `blocked_by` on the other bean), so each direction is the union of both storages (BC-37, TP-11).
 */
export function relationsOf(beans: readonly BeanSummary[], id: string): Relations | undefined {
  const byId = new Map(beans.map((bean) => [bean.id, bean]));
  const bean = byId.get(id);
  if (!bean) return undefined;
  const link = (ids: Iterable<string>): Related[] => [...new Set(ids)].map((one) => ({ id: one, bean: byId.get(one) }));
  return {
    parent: bean.parentId === null ? undefined : { id: bean.parentId, bean: byId.get(bean.parentId) },
    children: link(bean.childIds),
    blockedBy: link([...bean.blockedByIds, ...bean.blockedByLinkIds]),
    blocks: link([...bean.blockingIds, ...beans.filter((other) => other.blockedByIds.includes(id)).map((other) => other.id)]),
  };
}

/** Most visited beans a Back trail remembers. Older ones drop off first. */
export const TRAIL_LIMIT = 50;

/** The trail after following a link from `from`. A missing `from` (nothing was shown) leaves it unchanged. */
export const pushTrail = (trail: readonly string[], from: string | null): readonly string[] =>
  from === null || trail.at(-1) === from ? trail : [...trail, from].slice(-TRAIL_LIMIT);

/** The bean to go back to and the shortened trail, or undefined when the trail is empty. */
export function popTrail(trail: readonly string[]): { readonly id: string; readonly trail: readonly string[] } | undefined {
  const id = trail.at(-1);
  return id === undefined ? undefined : { id, trail: trail.slice(0, -1) };
}
