import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, C, backend, bean, harness, loaded, read } from './support.ts';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('loading states', () => {
  it('is loading before the first answer, then ready, with the refresh time', async () => {
    const { state, port } = harness();
    expect(state.getSnapshot()).toMatchObject({ status: 'loading', refreshing: false, refreshedAt: null, beans: [] });

    const started = state.start();
    expect(state.getSnapshot()).toMatchObject({ status: 'loading', refreshing: true });
    port.lastList.settle({ ok: true, value: read([bean(A)]) });
    await started;

    expect(state.getSnapshot()).toMatchObject({ status: 'ready', refreshing: false, failure: null, stale: false, refreshedAt: Date.UTC(2026, 9, 26, 20) });
  });

  it('tells an empty project from a filter that matches nothing', async () => {
    const { state } = await loaded([]);
    expect(state.getSnapshot().status).toBe('empty');

    const full = await loaded([bean(A)]);
    full.state.setFilters({ search: 'no such bean' });
    expect(full.state.getSnapshot()).toMatchObject({ status: 'no-matches', beans: [expect.anything()], visible: [] });
  });

  it('distinguishes a disconnected backend from invalid data when nothing is cached', async () => {
    const down = harness();
    const first = down.state.start();
    down.port.lastList.settle({ ok: false, error: backend('unavailable') });
    await first;
    expect(down.state.getSnapshot()).toMatchObject({ status: 'disconnected', failure: { code: 'unavailable' } });

    const broken = harness();
    const second = broken.state.start();
    broken.port.lastList.settle({ ok: false, error: backend('invalid-data', 'loading beans: loading x.md: parsing front matter') });
    await second;
    expect(broken.state.getSnapshot()).toMatchObject({ status: 'invalid-data', failure: { code: 'invalid-data' } });
  });

  it('keeps cached beans, marked stale, when only a refresh fails, and recovers on the next success', async () => {
    const { state, port } = await loaded([bean(A)]);

    const refreshing = state.refresh();
    port.lastList.settle({ ok: false, error: backend('timeout') });
    await refreshing;
    expect(state.getSnapshot()).toMatchObject({ status: 'ready', stale: true, failure: { code: 'timeout' }, beans: [{ id: A }] });

    const again = state.refresh();
    port.lastList.settle({ ok: true, value: read([bean(A), bean(B)]) });
    await again;
    expect(state.getSnapshot()).toMatchObject({ stale: false, failure: null, beans: [{ id: A }, { id: B }] });
  });

  it('reports files that Beans would load but that are not beans, without hiding the valid beans', async () => {
    const { state } = await loaded([bean(A)], { invalid: [{ path: 'notes/readme.md', reason: 'name' }] });

    expect(state.getSnapshot()).toMatchObject({ status: 'ready', invalid: [{ path: 'notes/readme.md', reason: 'name' }] });
  });

  it('turns a rejecting port into a backend failure instead of an unhandled rejection', async () => {
    const { state, port } = harness();
    const started = state.start();
    port.lastList.reject(new Error('boom'));
    await started;

    expect(state.getSnapshot()).toMatchObject({ status: 'disconnected', failure: { kind: 'backend', code: 'failed', message: 'boom' } });
  });

  it('shows beans in one deterministic order whatever order Beans answers in', async () => {
    const rows = [
      bean(C, { status: 'completed', title: 'zeta' }),
      bean(B, { status: 'todo', title: 'Beta' }),
      bean(A, { status: 'todo', title: 'alpha' }),
      bean('FX-ddddd', { status: 'in-progress', priority: 'low', title: 'delta' }),
      bean('FX-eeeee', { status: 'todo', title: 'alpha' }),
    ];
    const forward = await loaded(rows);
    const backward = await loaded([...rows].reverse());

    const ids = forward.state.getSnapshot().beans.map((one) => one.id);
    expect(ids).toEqual(['FX-ddddd', A, 'FX-eeeee', B, C]);
    expect(backward.state.getSnapshot().beans.map((one) => one.id)).toEqual(ids);
  });
});

describe('refresh', () => {
  it('ignores an older answer that arrives after a newer one', async () => {
    const { state, port } = harness();
    const first = state.start();
    const second = state.refresh();
    const [older, newer] = port.lists;

    newer?.settle({ ok: true, value: read([bean(B)]) });
    await second;
    older?.settle({ ok: true, value: read([bean(A)]) });
    await first;

    expect(older?.signal?.aborted).toBe(true);
    expect(state.getSnapshot().beans.map((one) => one.id)).toEqual([B]);
    expect(state.getSnapshot().refreshing).toBe(false);
  });

  it('ignores an older failure that arrives after a newer success', async () => {
    const { state, port } = harness();
    const first = state.start();
    const second = state.refresh();
    const [older, newer] = port.lists;

    newer?.settle({ ok: true, value: read([bean(B)]) });
    await second;
    older?.settle({ ok: false, error: backend('cancelled') });
    await first;

    expect(state.getSnapshot()).toMatchObject({ status: 'ready', failure: null });
  });

  it('turns a burst of vault events into one refresh after the quiet period', async () => {
    const { state, port } = await loaded([bean(A)]);
    expect(port.lists).toHaveLength(1);

    for (let event = 0; event < 20; event++) {
      state.vaultChanged(`Task root/${A}--x.md`);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(port.lists).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(300);
    expect(port.lists).toHaveLength(2);
  });

  it('refreshes for changes under the task root only, including a move in or out', async () => {
    const { state, port } = await loaded([bean(A)]);
    const refreshes = async (path: string, oldPath?: string): Promise<boolean> => {
      const before = port.lists.length;
      state.vaultChanged(path, oldPath);
      await vi.advanceTimersByTimeAsync(300);
      port.lists.at(-1)?.settle({ ok: true, value: read([bean(A)]) });
      return port.lists.length > before;
    };

    expect(await refreshes('Task root/FX-aaaaa--x.md')).toBe(true);
    expect(await refreshes('Task root/sub/FX-bbbbb--y.md')).toBe(true);
    expect(await refreshes('Task root/archive')).toBe(true);
    expect(await refreshes('Elsewhere/note.md', 'Task root/FX-aaaaa--x.md')).toBe(true);
    expect(await refreshes('Task root/FX-aaaaa--x.png')).toBe(false);
    expect(await refreshes('Task root 2/FX-aaaaa--x.md')).toBe(false);
    expect(await refreshes('Elsewhere/note.md')).toBe(false);
  });

  it('refreshes for every note when the task root is the vault root', async () => {
    const { state, port } = await loaded([bean(A)], {}, { taskRoot: '' });

    state.vaultChanged('any/note.md');
    await vi.advanceTimersByTimeAsync(300);

    expect(port.lists).toHaveLength(2);
  });

  it('lets an explicit refresh replace a scheduled one', async () => {
    const { state, port } = await loaded([bean(A)]);
    state.vaultChanged(`Task root/${A}--x.md`);

    const refreshing = state.refresh();
    port.lastList.settle({ ok: true, value: read([bean(A)]) });
    await refreshing;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(port.lists).toHaveLength(2);
  });

  it('retries a failed parse once after the debounce, and then leaves the failure standing', async () => {
    const { state, port } = await loaded([bean(A)]);
    const parse = backend('invalid-data', 'loading beans: parsing front matter');

    const refreshing = state.refresh();
    port.lastList.settle({ ok: false, error: parse });
    await refreshing;
    expect(port.lists).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(300);
    expect(port.lists).toHaveLength(3);
    port.lastList.settle({ ok: false, error: parse });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(port.lists).toHaveLength(3);
    expect(state.getSnapshot()).toMatchObject({ stale: true, failure: { code: 'invalid-data' } });
  });

  it('recovers when the retry finds the file complete', async () => {
    const { state, port } = await loaded([bean(A)]);
    const refreshing = state.refresh();
    port.lastList.settle({ ok: false, error: backend('invalid-data') });
    await refreshing;

    await vi.advanceTimersByTimeAsync(300);
    port.lastList.settle({ ok: true, value: read([bean(A), bean(B)]) });
    await vi.advanceTimersByTimeAsync(0);

    expect(state.getSnapshot()).toMatchObject({ failure: null, stale: false, beans: [{ id: A }, { id: B }] });
  });

  it('does not retry other failures', async () => {
    const { state, port } = await loaded([bean(A)]);
    const refreshing = state.refresh();
    port.lastList.settle({ ok: false, error: backend('unavailable') });
    await refreshing;
    await vi.advanceTimersByTimeAsync(5_000);

    expect(port.lists).toHaveLength(2);
  });
});

describe('lifecycle', () => {
  it('loads nothing until it is started, and ignores vault events before then', () => {
    const { state, port } = harness();

    state.vaultChanged('Task root/x.md');
    vi.advanceTimersByTime(1_000);

    expect(port.lists).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts once', async () => {
    const { state, port } = harness();
    void state.start();
    await state.start();

    expect(port.lists).toHaveLength(1);
  });

  it('rejects debounce times that cannot work', () => {
    expect(() => harness({ debounceMs: -1 })).toThrow(RangeError);
    expect(() => harness({ draftSaveMs: Number.NaN })).toThrow(RangeError);
  });

  it('stops everything on dispose: request aborted, timers cleared, listeners released, late answers ignored', async () => {
    const { state, port } = harness();
    const listener = vi.fn();
    state.subscribe(listener);
    const started = state.start();
    const inFlight = port.lastList;
    state.vaultChanged('Task root/x.md');
    listener.mockClear();

    await state.dispose();
    inFlight.settle({ ok: true, value: read([bean(A)]) });
    await started;
    state.vaultChanged('Task root/y.md');
    await vi.advanceTimersByTimeAsync(10_000);

    expect(inFlight.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    expect(state.getSnapshot().beans).toEqual([]);
    expect(port.lists).toHaveLength(1);
    await state.refresh();
    expect(port.lists).toHaveLength(1);
  });

  it('can be disposed twice, and a late subscriber is never called', async () => {
    const { state } = harness();
    await state.dispose();
    await state.dispose();
    const listener = vi.fn();
    state.subscribe(listener)();

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps notifying the other subscribers when one throws, and stops one that unsubscribed', async () => {
    const { state, port } = harness();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = vi.fn(() => {
      throw new Error('bad listener');
    });
    const healthy = vi.fn();
    const stopped = vi.fn();
    state.subscribe(broken);
    state.subscribe(healthy);
    state.subscribe(stopped)();

    const started = state.start();
    port.lastList.settle({ ok: true, value: read([bean(A)]) });
    await started;

    expect(healthy).toHaveBeenCalled();
    expect(broken).toHaveBeenCalled();
    expect(errors).toHaveBeenCalled();
    expect(stopped).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('answers an old project\'s state, not a new one: a replaced state never reaches its successor', async () => {
    const oldProject = harness();
    const newProject = harness();
    const old = oldProject.state.start();
    await oldProject.state.dispose();
    const fresh = newProject.state.start();
    newProject.port.lastList.settle({ ok: true, value: read([bean(B)]) });
    await fresh;
    oldProject.port.lastList.settle({ ok: true, value: read([bean(A)]) });
    await old;

    expect(newProject.state.getSnapshot().beans.map((one) => one.id)).toEqual([B]);
    expect(oldProject.state.getSnapshot().beans).toEqual([]);
  });
});
