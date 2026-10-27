import { describe, expect, it } from 'vitest';
import { listRows, matchesFilters, orderBeans, sortBeans, tagCounts } from '../../src/state/filters.ts';
import { DEFAULT_FILTERS, DEFAULT_SORT } from '../../src/state/model.ts';
import { A, B, C, VOCABULARY, bean } from './support.ts';

const ids = (beans: readonly { id: string }[]): string[] => beans.map((one) => one.id);
const none = { blocked: new Set<string>(), ready: new Set<string>() };

describe('sorting', () => {
  const beans = orderBeans(
    [
      bean(A, { title: 'b', priority: 'low', updatedAt: '2026-10-26T10:00:00Z' }),
      bean(B, { title: 'a', priority: 'low', updatedAt: '2026-10-26T12:00:00Z' }),
      bean(C, { title: 'c', priority: 'high', updatedAt: '2026-10-26T11:00:00Z' }),
    ],
    VOCABULARY,
  );

  it('keeps the default order when asked for it, and reverses it on request', () => {
    expect(ids(sortBeans(beans, DEFAULT_SORT, VOCABULARY))).toEqual([C, B, A]);
    expect(ids(sortBeans(beans, { key: 'default', descending: true }, VOCABULARY))).toEqual([A, B, C]);
  });

  it('sorts by the chosen key and breaks ties in the default order, in both directions', () => {
    const by = (key: 'title' | 'priority' | 'updated' | 'id', descending = false): string[] => ids(sortBeans(beans, { key, descending }, VOCABULARY));

    expect(by('title')).toEqual([B, A, C]);
    expect(by('updated', true)).toEqual([B, C, A]);
    expect(by('id', true)).toEqual([C, B, A]);
    // Priority: critical..deferred. A and B tie on `low`, so the default order (B before A) decides, whichever way it runs.
    expect(by('priority')).toEqual([C, B, A]);
    expect(by('priority', true)).toEqual([B, A, C]);
    expect(ids(sortBeans([bean(A, { status: 'done-ish' }), bean(B, { status: 'draft', type: 'bug' }), bean(C, { type: 'epic' })], { key: 'status', descending: false }, VOCABULARY))).toEqual([C, B, A]);
    expect(ids(sortBeans([bean(A), bean(B, { type: 'epic' })], { key: 'type', descending: false }, VOCABULARY))).toEqual([B, A]);
  });
});

describe('list rows', () => {
  const parent = bean(A, { type: 'epic', childIds: [B] });
  const child = bean(B, { parentId: A, tags: ['x'], childIds: [C] });
  const grandchild = bean(C, { parentId: B, tags: ['x'] });
  const all = orderBeans([parent, child, grandchild, bean('FX-ddddd', { tags: ['y'] })], VOCABULARY);
  const visible = all.filter((one) => matchesFilters(one, { ...DEFAULT_FILTERS, tags: ['x'] }, none));

  it('adds every ancestor of a match as a context row and marks only those', () => {
    const rows = listRows(all, visible, DEFAULT_SORT, VOCABULARY);

    expect(rows.map((row) => [row.bean.id, row.context])).toEqual([
      [A, true],
      [B, false],
      [C, false],
    ]);
  });

  it('shows no context when nothing is filtered, and survives a parent cycle and a missing parent', () => {
    expect(listRows(all, all, DEFAULT_SORT, VOCABULARY).some((row) => row.context)).toBe(false);

    const looped = [bean(A, { parentId: B }), bean(B, { parentId: A }), bean(C, { parentId: 'FX-gone' })];
    const rows = listRows(looped, [looped[0] ?? bean(A)], DEFAULT_SORT, VOCABULARY);
    expect(rows.map((row) => [row.bean.id, row.context])).toEqual([[A, false], [B, true]]);
    expect(listRows(looped, [looped[2] ?? bean(C)], DEFAULT_SORT, VOCABULARY)).toHaveLength(1);
  });

  it('counts each tag once per bean, by name', () => {
    expect(tagCounts([bean(A, { tags: ['b', 'a'] }), bean(B, { tags: ['a'] })])).toEqual([['a', 2], ['b', 1]]);
  });
});
