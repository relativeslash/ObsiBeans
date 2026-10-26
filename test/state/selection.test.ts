import { describe, expect, it } from 'vitest';
import { matchesFilters } from '../../src/state/filters.ts';
import { DEFAULT_FILTERS } from '../../src/state/model.ts';
import { A, B, C, bean, loaded, read } from './support.ts';

const none = { blocked: new Set<string>(), ready: new Set<string>() };

describe('filter matching', () => {
  it('matches everything by default', () => {
    expect(matchesFilters(bean(A), DEFAULT_FILTERS, none)).toBe(true);
  });

  it('requires every search word, in any order, in the title, ID, slug or tags, ignoring case', () => {
    const one = bean(A, { title: 'Fix the Login page', tags: ['ui'], slug: 'fix-login' });
    const search = (text: string): boolean => matchesFilters(one, { ...DEFAULT_FILTERS, search: text }, none);

    expect(search('login fix')).toBe(true);
    expect(search('  FIX   ')).toBe(true);
    expect(search('fx-aaaaa')).toBe(true);
    expect(search('ui')).toBe(true);
    expect(search('login signup')).toBe(false);
  });

  it('treats search text as plain text, never as query syntax', () => {
    expect(matchesFilters(bean(A, { title: 'a (b' }), { ...DEFAULT_FILTERS, search: 'title:(' }, none)).toBe(false);
    expect(matchesFilters(bean(A, { title: 'x title:( y' }), { ...DEFAULT_FILTERS, search: 'title:(' }, none)).toBe(true);
  });

  it('combines value lists with and, values within a list with or, and tags with any', () => {
    const one = bean(A, { status: 'todo', type: 'bug', priority: 'high', tags: ['a', 'b'] });
    const matches = (patch: object): boolean => matchesFilters(one, { ...DEFAULT_FILTERS, ...patch }, none);

    expect(matches({ statuses: ['todo', 'draft'], types: ['bug'], priorities: ['high'] })).toBe(true);
    expect(matches({ statuses: ['draft'] })).toBe(false);
    expect(matches({ types: ['task'] })).toBe(false);
    expect(matches({ priorities: ['low'] })).toBe(false);
    expect(matches({ tags: ['z', 'b'] })).toBe(true);
    expect(matches({ tags: ['z'] })).toBe(false);
  });

  it('uses the backend readiness sets', () => {
    const sets = { blocked: new Set([B]), ready: new Set([A]) };

    expect(matchesFilters(bean(A), { ...DEFAULT_FILTERS, readiness: 'ready' }, sets)).toBe(true);
    expect(matchesFilters(bean(B), { ...DEFAULT_FILTERS, readiness: 'ready' }, sets)).toBe(false);
    expect(matchesFilters(bean(B), { ...DEFAULT_FILTERS, readiness: 'blocked' }, sets)).toBe(true);
    expect(matchesFilters(bean(C), { ...DEFAULT_FILTERS, readiness: 'blocked' }, sets)).toBe(false);
  });
});

describe('shared filters and selection', () => {
  const rows = [bean(A, { title: 'one', status: 'todo' }), bean(B, { title: 'two', status: 'draft' }), bean(C, { title: 'three', status: 'todo' })];

  it('applies the readiness sets from the load', async () => {
    const { state } = await loaded(rows, { readyIds: [A], blockedIds: [B] });

    state.setFilters({ readiness: 'blocked' });
    expect(state.getSnapshot().visible.map((one) => one.id)).toEqual([B]);
    state.setFilters({ readiness: 'ready' });
    expect(state.getSnapshot().visible.map((one) => one.id)).toEqual([A]);
  });

  it('keeps a hidden selection selected and counts it separately', async () => {
    const { state } = await loaded(rows);
    state.setSelected([A, B, C]);

    state.setFilters({ statuses: ['todo'] });

    expect(state.getSnapshot().selection).toEqual({ ids: [A, B, C], hidden: 1 });
    state.setFilters({ statuses: [] });
    expect(state.getSnapshot().selection.hidden).toBe(0);
  });

  it('toggles, replaces, selects the visible beans and clears', async () => {
    const { state } = await loaded(rows);

    state.toggleSelected(A);
    state.toggleSelected(B);
    state.toggleSelected(A);
    expect(state.getSnapshot().selection.ids).toEqual([B]);

    state.setFilters({ statuses: ['todo'] });
    state.selectVisible();
    expect(state.getSnapshot().selection).toEqual({ ids: [A, C], hidden: 0 });

    state.clearSelection();
    expect(state.getSnapshot().selection).toEqual({ ids: [], hidden: 0 });
  });

  it('can select only beans that exist, so context rows and unknown IDs never are', async () => {
    const { state } = await loaded(rows);

    state.toggleSelected('swimlane:parent:FX-zzzzz');
    state.setSelected([A, 'FX-missing']);
    state.select('FX-missing');

    expect(state.getSnapshot()).toMatchObject({ selection: { ids: [A] }, selectedId: null });
  });

  it('drops selected beans that disappeared on refresh, with a notice that can be dismissed', async () => {
    const { state, port } = await loaded(rows);
    state.setSelected([A, B]);

    const refreshing = state.refresh();
    port.lastList.settle({ ok: true, value: read([rows[0] ?? bean(A), rows[2] ?? bean(C)]) });
    await refreshing;

    const snapshot = state.getSnapshot();
    expect(snapshot.selection.ids).toEqual([A]);
    expect(snapshot.notices).toEqual([{ id: 1, kind: 'selection-removed', ids: [B] }]);
    state.dismissNotice(1);
    expect(state.getSnapshot().notices).toEqual([]);
  });

  it('keeps the inspected bean when it vanishes, and says it no longer exists', async () => {
    const { state, port } = await loaded(rows);
    state.select(B);
    expect(state.getSnapshot()).toMatchObject({ selectedId: B, selectedGone: false });

    const refreshing = state.refresh();
    port.lastList.settle({ ok: true, value: read([rows[0] ?? bean(A)]) });
    await refreshing;

    expect(state.getSnapshot()).toMatchObject({ selectedId: B, selectedGone: true });
    state.select(null);
    expect(state.getSnapshot()).toMatchObject({ selectedId: null, selectedGone: false });
  });

  it('shares one snapshot object between readers until something changes', async () => {
    const { state } = await loaded(rows);
    const before = state.getSnapshot();

    expect(state.getSnapshot()).toBe(before);
    state.setViewState('list', { scrollTop: 40, focusId: B });
    expect(state.getSnapshot()).toBe(before);
    state.toggleSelected(A);
    expect(state.getSnapshot()).not.toBe(before);
  });

  it('remembers scroll and focus per view across refreshes without notifying', async () => {
    const { state, port } = await loaded(rows);
    state.setViewState('list', { scrollTop: 120, focusId: B });
    state.setViewState('board', { scrollTop: 0, focusId: null });

    const refreshing = state.refresh();
    port.lastList.settle({ ok: true, value: read(rows) });
    await refreshing;

    expect(state.getViewState('list')).toEqual({ scrollTop: 120, focusId: B });
    expect(state.getViewState('board')).toEqual({ scrollTop: 0, focusId: null });
    expect(state.getViewState('hierarchy')).toBeUndefined();
  });

  it('keeps the same selection and filters for every view reading the state', async () => {
    const { state } = await loaded(rows);
    state.setFilters({ search: 'two' });
    state.select(B);

    const seenByList = state.getSnapshot();
    const seenByBoard = state.getSnapshot();
    expect(seenByList.selectedId).toBe(seenByBoard.selectedId);
    expect(seenByList.visible.map((one) => one.id)).toEqual([B]);
  });
});
