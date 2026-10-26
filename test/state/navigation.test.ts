import { describe, expect, it } from 'vitest';
import { matchesFilters } from '../../src/state/filters.ts';
import { NAV_GROUPS, NAV_IDS, navFilters, parseNavId, popTrail, pushTrail, relationsOf, TRAIL_LIMIT } from '../../src/state/navigation.ts';
import { A, B, bean, C } from './support.ts';

describe('built-in navigation', () => {
  it('lists every entry once, in groups', () => {
    expect(NAV_GROUPS.flatMap((group) => group.ids)).toEqual([...NAV_IDS]);
  });

  it('filters by backend readiness, status and type', () => {
    const beans = [
      bean(A, { status: 'in-progress', type: 'epic' }),
      bean(B, { type: 'milestone' }),
      bean(C, { status: 'completed' }),
    ];
    const readiness = { ready: new Set([B]), blocked: new Set([C]) };
    const shown = (id: (typeof NAV_IDS)[number]): string[] =>
      beans.filter((one) => matchesFilters(one, navFilters(id), readiness)).map((one) => one.id);

    expect(shown('all')).toEqual([A, B, C]);
    expect(shown('ready')).toEqual([B]);
    expect(shown('in-progress')).toEqual([A]);
    expect(shown('blocked')).toEqual([C]);
    expect(shown('milestones')).toEqual([B]);
    expect(shown('epics')).toEqual([A]);
  });

  it('replaces every other filter, so an entry never inherits a stale search', () => {
    expect(navFilters('epics')).toEqual({ search: '', statuses: [], types: ['epic'], priorities: [], tags: [], readiness: 'any' });
  });

  it('falls back to All work for stored values it does not know', () => {
    expect(parseNavId('ready')).toBe('ready');
    for (const value of ['nope', 3, null, undefined]) expect(parseNavId(value)).toBe('all');
  });
});

describe('relations', () => {
  it('builds both blocker directions from either storage, without duplicates', () => {
    const beans = [
      bean(A, { blockingIds: [B], blockedByLinkIds: [C], blockedByIds: [] }),
      bean(B, { blockedByIds: [A], blockedByLinkIds: [A] }),
      bean(C, { blockedByIds: [A] }),
    ];

    const a = relationsOf(beans, A);
    expect(a?.blocks.map((one) => one.id)).toEqual([B, C]);
    expect(a?.blockedBy.map((one) => one.id)).toEqual([C]);
    expect(relationsOf(beans, B)?.blockedBy.map((one) => one.id)).toEqual([A]);
  });

  it('resolves parent and children, and flags links to beans that do not exist', () => {
    const beans = [bean(A, { childIds: [B, 'FX-gone'] }), bean(B, { parentId: A }), bean(C, { parentId: 'FX-lost' })];

    const a = relationsOf(beans, A);
    expect(a?.parent).toBeUndefined();
    expect(a?.children.map((one) => [one.id, one.bean?.id])).toEqual([[B, B], ['FX-gone', undefined]]);
    expect(relationsOf(beans, B)?.parent?.bean?.id).toBe(A);
    expect(relationsOf(beans, C)?.parent).toEqual({ id: 'FX-lost', bean: undefined });
    expect(relationsOf(beans, 'FX-none')).toBeUndefined();
  });
});

describe('back trail', () => {
  it('pushes the bean left behind and pops in reverse', () => {
    let trail = pushTrail([], A);
    trail = pushTrail(trail, B);

    expect(trail).toEqual([A, B]);
    expect(popTrail(trail)).toEqual({ id: B, trail: [A] });
    expect(popTrail([])).toBeUndefined();
  });

  it('ignores nothing-shown and repeated entries and stays bounded', () => {
    expect(pushTrail([A], null)).toEqual([A]);
    expect(pushTrail([A], A)).toEqual([A]);
    const long = Array.from({ length: TRAIL_LIMIT + 5 }, (_, index) => `FX-${String(index)}`).reduce<readonly string[]>(pushTrail, []);
    expect(long).toHaveLength(TRAIL_LIMIT);
    expect(long.at(-1)).toBe(`FX-${String(TRAIL_LIMIT + 4)}`);
  });
});
