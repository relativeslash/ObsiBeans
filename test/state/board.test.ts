import { describe, expect, it } from 'vitest';
import { orderBeans } from '../../src/state/filters.ts';
import { boardModel } from '../../src/state/board.ts';
import { DEFAULT_SORT } from '../../src/state/model.ts';
import { A, B, C, VOCABULARY, bean } from './support.ts';

const D = 'FX-ddddd';
const ids = (cell: readonly { id: string }[] | undefined): string[] => (cell ?? []).map((one) => one.id);

describe('board model', () => {
  const all = [
    bean(A, { title: 'Alpha', type: 'epic', status: 'in-progress' }),
    bean(B, { title: 'Beta', parentId: A, status: 'todo' }),
    bean(C, { title: 'Gamma', parentId: A, status: 'todo' }),
    bean(D, { title: 'Delta', status: 'scrapped' }),
  ];

  it('has the five statuses in workflow order, not the backend order, with filtered counts', () => {
    const model = boardModel(all, [all[1] as (typeof all)[number], all[3] as (typeof all)[number]], DEFAULT_SORT, VOCABULARY, 'none');
    expect(model.statuses).toEqual(['draft', 'todo', 'in-progress', 'completed', 'scrapped']);
    expect(model.totals).toEqual([0, 1, 0, 0, 1]);
    expect(model.lanes).toHaveLength(1);
    expect(model.lanes[0]?.header).toBe(false);
  });

  it('keeps an unknown status visible as an extra column', () => {
    const odd = bean(B, { status: 'blocked-ish' });
    const model = boardModel([odd], [odd], DEFAULT_SORT, VOCABULARY, 'none');
    expect(model.statuses.at(-1)).toBe('blocked-ish');
    expect(model.totals.at(-1)).toBe(1);
  });

  it('orders cards by the list order, so the same beans give the same cards however they were read', () => {
    const reversed = [...all].reverse();
    const todo = (input: typeof all) => { const list = orderBeans(input, VOCABULARY); return ids(boardModel(list, list, DEFAULT_SORT, VOCABULARY, 'none').lanes[0]?.cells[1]); };
    expect(todo(all)).toEqual([B, C]);
    expect(todo(reversed)).toEqual([B, C]);
  });

  it('groups by direct parent in the default order with No parent last, and never makes a lane of a parent without cards', () => {
    const model = boardModel(all, all, DEFAULT_SORT, VOCABULARY, 'parent');
    expect(model.lanes.map((lane) => lane.key)).toEqual([A, '']);
    expect(model.lanes[0]?.parent?.id).toBe(A);
    expect(model.lanes[1]?.parentId).toBeNull();
    // Alpha is both a parent (lane header) and a card in the No parent lane; the header is not a card.
    expect(ids(model.lanes[0]?.cells[1])).toEqual([B, C]);
    expect(ids(model.lanes[1]?.cells[2])).toEqual([A]);

    const only = boardModel(all, [all[1] as (typeof all)[number]], DEFAULT_SORT, VOCABULARY, 'parent');
    expect(only.lanes.map((lane) => lane.key)).toEqual([A]);
  });

  it('puts a lane for a parent no bean has after the real ones, by ID', () => {
    const orphan = bean(D, { parentId: 'FX-zzzzz' });
    const model = boardModel([...all, orphan], [...all, orphan], DEFAULT_SORT, VOCABULARY, 'parent');
    expect(model.lanes.map((lane) => lane.key)).toEqual([A, 'FX-zzzzz', '']);
    expect(model.lanes[1]?.parent).toBeUndefined();
  });
});
