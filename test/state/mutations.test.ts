import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Change } from '../../src/adapter/beans-write.ts';
import { A, B, backend, bean, detail, loaded, read } from './support.ts';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const status = (value: string): Change => ({ kind: 'fields', status: value });

describe('mutations', () => {
  it('shows a change as pending, keeps the cached bean unchanged until Beans confirms, then converges', async () => {
    const { state, port } = await loaded([bean(A, { status: 'todo' })]);

    const saving = state.mutate(A, status('completed'));
    expect(state.getSnapshot().saves.get(A)).toEqual({ kind: 'pending', intent: status('completed') });
    expect(state.getSnapshot().beans[0]?.status).toBe('todo');
    expect(port.mutations[0]?.args).toEqual([A, `rev-${A}`, status('completed')]);

    port.mutations[0]?.settle({ ok: true, value: detail(A, { status: 'completed', revision: 'rev-2', body: '\nnew' }) });
    const result = await saving;

    expect(result).toMatchObject({ kind: 'saved', bean: { id: A } });
    const snapshot = state.getSnapshot();
    expect(snapshot.saves.size).toBe(0);
    expect(snapshot.beans[0]).toMatchObject({ status: 'completed', revision: 'rev-2' });
    expect(snapshot.beans[0]).not.toHaveProperty('body');
  });

  it('reloads after a confirmed write, and an older load that was in flight cannot undo it', async () => {
    const { state, port } = await loaded([bean(A, { status: 'todo' })]);
    const refreshing = state.refresh();
    const stale = port.lastList;

    const saving = state.mutate(A, status('completed'));
    port.mutations[0]?.settle({ ok: true, value: detail(A, { status: 'completed' }) });
    await saving;
    stale.settle({ ok: true, value: read([bean(A, { status: 'todo' })]) });
    await refreshing;

    expect(state.getSnapshot().beans[0]?.status).toBe('completed');
    await vi.advanceTimersByTimeAsync(300);
    port.lastList.settle({ ok: true, value: read([bean(A, { status: 'completed', revision: 'rev-2' })]) });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.getSnapshot().beans[0]).toMatchObject({ status: 'completed', revision: 'rev-2' });
  });

  it('ignores repeated clicks while a change is pending, so one write happens', async () => {
    const { state, port } = await loaded([bean(A)]);

    const first = state.mutate(A, status('completed'));
    const second = await state.mutate(A, status('completed'));
    const third = await state.mutate(A, status('draft'));

    expect(second).toEqual({ kind: 'ignored', reason: 'busy' });
    expect(third).toEqual({ kind: 'ignored', reason: 'busy' });
    expect(port.mutations).toHaveLength(1);
    port.mutations[0]?.settle({ ok: true, value: detail(A) });
    await first;
  });

  it('writes to two different beans independently', async () => {
    const { state, port } = await loaded([bean(A), bean(B)]);

    void state.mutate(A, status('draft'));
    void state.mutate(B, status('draft'));

    expect(port.mutations).toHaveLength(2);
    expect(state.getSnapshot().saves.size).toBe(2);
  });

  it('uses the caller\'s basis revision instead of the cached one', async () => {
    const { state, port } = await loaded([bean(A)]);

    void state.mutate(A, status('draft'), 'seen-when-editing');

    expect(port.mutations[0]?.args[1]).toBe('seen-when-editing');
  });

  it('records a failure without touching the cached bean, and allows a retry', async () => {
    const { state, port } = await loaded([bean(A)]);
    const saving = state.mutate(A, status('draft'));
    const error = backend('timeout');
    port.mutations[0]?.settle({ ok: false, error });

    expect(await saving).toEqual({ kind: 'failed', error });
    expect(state.getSnapshot().saves.get(A)).toEqual({ kind: 'failed', error });
    expect(state.getSnapshot().beans[0]?.status).toBe('todo');

    const retry = state.mutate(A, status('draft'));
    expect(state.getSnapshot().saves.get(A)).toMatchObject({ kind: 'pending' });
    port.mutations[1]?.settle({ ok: true, value: detail(A, { status: 'draft' }) });
    await retry;
    expect(state.getSnapshot().saves.size).toBe(0);
  });

  it('surfaces a conflict with the current bean and refreshes, and a retry on the new basis is explicit', async () => {
    const { state, port } = await loaded([bean(A)]);
    const saving = state.mutate(A, status('draft'));
    const current = detail(A, { status: 'completed', revision: 'rev-new' });
    port.mutations[0]?.settle({ ok: false, error: { kind: 'conflict', code: 'revision', current } });
    await saving;

    expect(state.getSnapshot().saves.get(A)).toMatchObject({ kind: 'conflict', error: { current: { revision: 'rev-new' } } });
    await vi.advanceTimersByTimeAsync(300);
    expect(port.lists).toHaveLength(2);

    void state.mutate(A, status('draft'), 'rev-new');
    expect(port.mutations[1]?.args[1]).toBe('rev-new');
  });

  it('blocks every further write to a bean after an uncertain result until the user dismisses it', async () => {
    const { state, port } = await loaded([bean(A)]);
    const saving = state.mutate(A, status('draft'));
    const error = { kind: 'uncertain' as const, message: 'timed out', current: null, createdIds: [] };
    port.mutations[0]?.settle({ ok: false, error });
    await saving;

    expect(state.getSnapshot().saves.get(A)).toEqual({ kind: 'uncertain', error });
    expect(await state.mutate(A, status('draft'))).toEqual({ kind: 'ignored', reason: 'unreconciled' });
    expect(port.mutations).toHaveLength(1);

    state.dismissSave(A);
    void state.mutate(A, status('draft'));
    expect(port.mutations).toHaveLength(2);
  });

  it('cannot dismiss a save that is still pending', async () => {
    const { state } = await loaded([bean(A)]);
    void state.mutate(A, status('draft'));

    state.dismissSave(A);

    expect(state.getSnapshot().saves.get(A)).toMatchObject({ kind: 'pending' });
    state.dismissSave('nothing');
  });

  it('treats a throwing port as an uncertain write, never a plain failure', async () => {
    const { state, port } = await loaded([bean(A)]);
    const saving = state.mutate(A, status('draft'));
    port.mutations[0]?.reject(new Error('socket closed'));

    expect(await saving).toMatchObject({ kind: 'failed', error: { kind: 'uncertain', message: 'socket closed' } });
    expect(String(state.getSnapshot().saves.get(A)?.kind)).toBe('uncertain');
  });

  it('refuses a bean that is not in the project, and one whose file cannot be read', async () => {
    const { state, port } = await loaded([bean(A, { revision: null, problems: ['unreadable'] })]);

    expect(await state.mutate('FX-zzzzz', status('draft'))).toEqual({ kind: 'ignored', reason: 'unknown-bean' });
    expect(await state.mutate(A, status('draft'))).toMatchObject({ kind: 'failed', error: { kind: 'preservation' } });
    expect(port.mutations).toHaveLength(0);
  });

  it('ignores calls after dispose, and a write that finishes after dispose changes nothing', async () => {
    const { state, port } = await loaded([bean(A)]);
    const saving = state.mutate(A, status('draft'));
    await state.dispose();
    port.mutations[0]?.settle({ ok: true, value: detail(A, { status: 'draft' }) });

    expect(await saving).toEqual({ kind: 'ignored', reason: 'disposed' });
    expect(await state.mutate(A, status('draft'))).toEqual({ kind: 'ignored', reason: 'disposed' });
    expect(state.getSnapshot().beans[0]?.status).toBe('todo');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('creation', () => {
  it('adds the confirmed bean, keyed by the form until it has an ID, and refuses a double submit', async () => {
    const { state, port } = await loaded([bean(A)]);

    const creating = state.create('form-1', { title: 'New' });
    const again = await state.create('form-1', { title: 'New' });
    expect(again).toEqual({ kind: 'ignored', reason: 'busy' });
    expect(state.getSnapshot().saves.get('new:form-1')).toMatchObject({ kind: 'pending' });

    port.creations[0]?.settle({ ok: true, value: detail(B, { title: 'New' }) });
    await creating;

    expect(port.creations).toHaveLength(1);
    expect(state.getSnapshot().beans.map((one) => one.id)).toEqual([B, A]);
    expect(state.getSnapshot().saves.size).toBe(0);
  });

  it('never allows a second attempt after an uncertain creation until dismissed, because Beans has no guard', async () => {
    const { state, port } = await loaded([bean(A)]);
    const creating = state.create('form-1', { title: 'New' });
    port.creations[0]?.settle({ ok: false, error: { kind: 'uncertain', message: 'x', current: null, createdIds: [B] } });
    await creating;

    expect(await state.create('form-1', { title: 'New' })).toEqual({ kind: 'ignored', reason: 'unreconciled' });
    expect(port.creations).toHaveLength(1);
    expect(state.getSnapshot().saves.get('new:form-1')).toMatchObject({ kind: 'uncertain', error: { createdIds: [B] } });
  });
});
