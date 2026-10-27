import { describe, expect, it } from 'vitest';
import { orderBeans } from '../../src/state/filters.ts';
import { blockersByBean, hierarchyRows, progressByBean } from '../../src/state/hierarchy.ts';
import { DEFAULT_SORT } from '../../src/state/model.ts';
import { A, B, C, VOCABULARY, bean } from './support.ts';

const D = 'FX-ddddd';
const E = 'FX-eeeee';
const F = 'FX-fffff';
const G = 'FX-ggggg';

/** Milestone A holds epic B (tasks C done, D scrapped, E open) and an empty epic F; milestone G is empty. */
const tree = () => [
  bean(A, { type: 'milestone', title: 'Alpha' }),
  bean(B, { type: 'epic', title: 'Beta', parentId: A }),
  bean(C, { title: 'Gamma', parentId: B, status: 'completed' }),
  bean(D, { title: 'Delta', parentId: B, status: 'scrapped' }),
  bean(E, { title: 'Epsilon', parentId: B }),
  bean(F, { type: 'epic', title: 'Zeta', parentId: A }),
  bean(G, { type: 'milestone', title: 'Eta' }),
];
const ids = (rows: readonly { bean: { id: string } }[]): string[] => rows.map((row) => row.bean.id);
const rowsOf = (all: ReturnType<typeof tree>, visible = all, expanded = new Map<string, boolean>()) => {
  const list = orderBeans(all, VOCABULARY);
  return hierarchyRows(list, orderBeans(visible, VOCABULARY), DEFAULT_SORT, VOCABULARY, expanded);
};

describe('progress', () => {
  it('counts leaves at any depth, completed apart from scrapped, and never the parents', () => {
    const progress = progressByBean(tree());

    expect(progress.get(B)).toEqual({ completed: 1, scrapped: 1, open: 1, kind: 'counted', percent: 50 });
    // The milestone counts the leaves below B and the empty epic F as a leaf: B itself is not counted twice.
    expect(progress.get(A)).toEqual({ completed: 1, scrapped: 1, open: 2, kind: 'counted', percent: 33 });
    expect(progress.has(C)).toBe(false);
  });

  it('is "all-scrapped" when only scrapped leaves remain, and has no entry for a bean without children', () => {
    const all = [bean(A, { type: 'milestone' }), bean(B, { type: 'epic', parentId: A }), bean(C, { parentId: B, status: 'scrapped' }), bean(D, { type: 'milestone' }), bean(E, { type: 'epic', parentId: D })];
    const progress = progressByBean(all);

    expect(progress.get(B)).toEqual({ completed: 0, scrapped: 1, open: 0, kind: 'all-scrapped', percent: 0 });
    expect(progress.get(A)).toMatchObject({ kind: 'all-scrapped', scrapped: 1 });
    // E is the only leaf below D, and it is open.
    expect(progress.get(D)).toMatchObject({ kind: 'counted', open: 1, percent: 0 });
    // An empty milestone or epic has no entry; the view says "No child work" for it. A leaf epic still counts in its parent.
    expect(progress.get(E)).toBeUndefined();
    expect(progressByBean([bean(G, { type: 'milestone' })]).size).toBe(0);
  });

  it('shows 100 only when every counted leaf is completed', () => {
    const all = [bean(A, { type: 'epic' }), ...Array.from({ length: 3 }, (_, at) => bean(`FX-t${String(at)}`, { parentId: A, status: at < 2 ? 'completed' : 'todo' }))];
    expect(progressByBean(all).get(A)?.percent).toBe(66);
    expect(progressByBean(all.map((one) => (one.parentId ? { ...one, status: 'completed' } : one))).get(A)?.percent).toBe(100);
  });

  it('stops at a parent loop and a missing parent instead of hanging', () => {
    const loop = [bean(A, { type: 'epic', parentId: B }), bean(B, { type: 'epic', parentId: A }), bean(C, { parentId: A, status: 'completed' })];
    const progress = progressByBean(loop);

    expect(progress.get(A)).toEqual({ completed: 1, scrapped: 0, open: 0, kind: 'counted', percent: 100 });
    expect(progress.get(B)).toMatchObject({ kind: 'counted', completed: 1 });
    // Only loop members below: no leaf at all.
    expect(progressByBean([bean(A, { parentId: B }), bean(B, { parentId: A })]).get(A)).toMatchObject({ kind: 'none', percent: 0 });
    expect(progressByBean([bean(A, { parentId: 'FX-zzzzz' })]).size).toBe(0);
  });
});

describe('blockers', () => {
  it('lists open blockers from both storage directions, ignoring finished and missing ones, and flags a loop', () => {
    const all = [
      bean(A, { blockingIds: [B] }),
      bean(B),
      bean(C, { blockedByIds: [B, D, 'FX-zzzzz'] }),
      bean(D, { status: 'completed' }),
    ];
    const found = blockersByBean(all);

    expect(found.get(B)).toEqual({ ids: [A], loop: false });
    expect(found.get(C)).toEqual({ ids: [B], loop: false });
    expect(found.has(A)).toBe(false);

    const looped = blockersByBean([bean(A, { blockingIds: [B], blockedByIds: [C] }), bean(B, { blockingIds: [C] }), bean(C)]);
    expect(looped.get(B)?.loop).toBe(true);
    expect(looped.get(C)?.loop).toBe(true);
  });
});

describe('hierarchy rows', () => {
  it('shows the roots closed by default, in the default order, with the number of children', () => {
    const rows = rowsOf(tree());

    expect(ids(rows)).toEqual([A, G]);
    expect(rows[0]).toMatchObject({ depth: 0, children: 2, expanded: false, context: false, problem: null });
    expect(rows[1]).toMatchObject({ children: 0, expanded: false });
  });

  it('opens only what the user opened, by full ID, in the chosen sort per level', () => {
    const all = tree();
    expect(ids(rowsOf(all, all, new Map([[A, true]])))).toEqual([A, B, F, G]);
    expect(ids(rowsOf(all, all, new Map([[A, true], [B, true]])))).toEqual([A, B, E, C, D, F, G]);
    expect(rowsOf(all, all, new Map([[A, true], [B, true]])).map((row) => row.depth)).toEqual([0, 1, 2, 2, 2, 1, 0]);
    // A choice about a bean that is not shown, or does not exist, changes nothing.
    expect(ids(rowsOf(all, all, new Map([['FX-zzzzz', true]])))).toEqual([A, G]);
  });

  it('under a filter opens the path to every match, marks the ancestors as context and hides the other children', () => {
    const all = tree();
    const rows = rowsOf(all, [all[2] as (typeof all)[number]]);

    expect(ids(rows)).toEqual([A, B, C]);
    expect(rows.map((row) => row.context)).toEqual([true, true, false]);
    expect(rows[1]).toMatchObject({ children: 1, expanded: true });
    // The user can still close a context row; the match is then not drawn but stays a match.
    expect(ids(rowsOf(all, [all[2] as (typeof all)[number]], new Map([[B, false]])))).toEqual([A, B]);
  });

  it('draws a bean whose parent is missing as a top-level row with the missing ID', () => {
    const rows = rowsOf([bean(A, { parentId: 'FX-zzzzz' }), bean(B, { title: 'Child', parentId: A })], undefined, new Map([[A, true]]));

    expect(ids(rows)).toEqual([A, B]);
    expect(rows[0]?.problem).toEqual({ kind: 'missing-parent', id: 'FX-zzzzz' });
    expect(rows[1]).toMatchObject({ depth: 1, problem: null });
  });

  it('draws every bean of a parent loop once, from the first in order, and keeps the loop flagged', () => {
    const all = [bean(A, { type: 'epic', parentId: B, title: 'A' }), bean(B, { type: 'epic', parentId: A, title: 'B' }), bean(C, { parentId: B }), bean(D, { type: 'epic', parentId: D })];
    const rows = rowsOf(all, undefined, new Map([[A, true], [B, true], [D, true]]));

    expect(ids(rows).sort()).toEqual([A, B, C, D]);
    expect(rows.filter((row) => row.problem?.kind === 'loop').map((row) => row.depth)).toEqual([0, 0]);
    expect(rows.find((row) => row.bean.id === D)).toMatchObject({ children: 0, expanded: false });
  });

  it('draws two files that claim one ID, each once', () => {
    const twin = bean(B, { path: 'twin.md', parentId: A });
    const rows = rowsOf([bean(A, { type: 'epic' }), bean(B, { parentId: A }), twin], undefined, new Map([[A, true]]));

    expect(rows.map((row) => row.bean.path)).toEqual([`${A}--x.md`, `${B}--x.md`, 'twin.md']);
  });
});
