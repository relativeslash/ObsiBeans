import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Outcome } from '../../src/adapter/beans-model.ts';
import type { BulkItem, BeanDetail } from '../../src/state/model.ts';
import { A, B, C, backend, bean, detail, loaded, read, type Harness } from './support.ts';

const D = 'FX-ddddd';
const E = 'FX-eeeee';
const F = 'FX-fffff';
const timeout = backend('timeout');
const uncertain = { kind: 'uncertain' as const, message: 'timed out', current: null, createdIds: [] };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Lets the runner reach its next awaited call. */
const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

const items = (made: Harness): Record<string, BulkItem['kind']> => Object.fromEntries((made.state.getSnapshot().bulk?.items ?? []).map((item) => [item.id, item.kind]));
const done = (id: string, extra: Partial<BeanDetail> = {}): Outcome<BeanDetail> => ({ ok: true, value: detail(id, extra) });
const ids = (made: Harness): unknown[] => made.port.mutations.map((call) => call.args[0]);
const status = (value: string) => ({ field: 'status', value }) as const;

/** Answers the next unanswered write. */
async function answer(made: Harness, index: number, outcome: Outcome<BeanDetail>): Promise<void> {
  made.port.mutations[index]?.settle(outcome);
  await flush();
}

describe('bulk editing', () => {
  it('targets every selected bean including hidden ones, with one write per bean, one at a time, on the revision seen at the start', async () => {
    const made = await loaded([bean(A), bean(B), bean(C)]);
    made.state.setSelected([A, B, C]);
    made.state.setFilters({ statuses: ['draft'] });
    expect(made.state.getSnapshot().selection).toEqual({ ids: [A, B, C], hidden: 3 });

    const running = made.state.applyBulk(status('draft'));
    await flush();

    expect(made.state.getSnapshot().bulk).toMatchObject({ phase: 'running', edit: status('draft') });
    expect(items(made)).toEqual({ [A]: 'running', [B]: 'pending', [C]: 'pending' });
    expect(made.port.mutations).toHaveLength(1);
    expect(made.port.mutations[0]?.args).toEqual([A, `rev-${A}`, { kind: 'fields', status: 'draft' }]);

    await answer(made, 0, done(A, { status: 'draft' }));
    await answer(made, 1, done(B, { status: 'draft' }));
    await answer(made, 2, done(C, { status: 'draft' }));

    expect(await running).toBe(true);
    expect(items(made)).toEqual({ [A]: 'saved', [B]: 'saved', [C]: 'saved' });
    expect(made.state.getSnapshot().bulk?.phase).toBe('done');
    expect(made.state.getSnapshot().selection.ids).toEqual([A, B, C]);
  });

  it('records each outcome on its own bean and never claims one for the others', async () => {
    const made = await loaded([bean(A), bean(B), bean(C), bean(D), bean(E, { status: 'draft' }), bean(F)]);
    made.state.setSelected([A, B, C, D, E, F]);

    const running = made.state.applyBulk(status('draft'));
    await flush();
    await answer(made, 0, done(A));
    await answer(made, 1, { ok: false, error: { kind: 'conflict', code: 'revision', current: detail(B, { revision: 'rev-new' }) } });
    await answer(made, 2, { ok: false, error: { kind: 'validation', code: 'backend', message: 'Beans refused it' } });
    await answer(made, 3, { ok: false, error: uncertain });
    await answer(made, 4, { ok: false, error: timeout });
    await running;

    // E already had the value, so it was never written.
    expect(ids(made)).toEqual([A, B, C, D, F]);
    expect(items(made)).toEqual({ [A]: 'saved', [B]: 'conflict', [C]: 'failed', [D]: 'uncertain', [E]: 'unchanged', [F]: 'failed' });
  });

  it('rejects an invalid parent for one bean locally while the others still go to Beans', async () => {
    const made = await loaded([bean(A, { type: 'milestone' }), bean(B, { type: 'epic' }), bean(C, { type: 'task' }), bean(D, { type: 'task' })]);
    made.state.setSelected([A, B, C, D]);

    const running = made.state.applyBulk({ field: 'parent', parentId: B });
    await flush();
    await answer(made, 0, done(C, { parentId: B }));
    await answer(made, 1, done(D, { parentId: B }));
    await running;

    const kinds = items(made);
    expect(kinds).toEqual({ [A]: 'failed', [B]: 'failed', [C]: 'saved', [D]: 'saved' });
    expect(ids(made)).toEqual([C, D]);
    const [first, second] = made.state.getSnapshot().bulk?.items ?? [];
    expect(first).toMatchObject({ error: { kind: 'validation' } });
    expect(second).toMatchObject({ error: { kind: 'validation', message: `${B} cannot be its own parent.` } });
  });

  it('retries only the beans without a saved result, on fresh revisions, and never an unchecked uncertain one', async () => {
    const made = await loaded([bean(A), bean(B), bean(C), bean(D)]);
    made.state.setSelected([A, B, C, D]);
    const running = made.state.applyBulk(status('draft'));
    await flush();
    await answer(made, 0, done(A));
    await answer(made, 1, { ok: false, error: timeout });
    await answer(made, 2, { ok: false, error: uncertain });
    await answer(made, 3, { ok: false, error: { kind: 'conflict', code: 'revision', current: detail(D) } });
    await running;

    const retrying = made.state.retryBulk();
    await flush();
    expect(made.port.lists).toHaveLength(2);
    expect(items(made)).toEqual({ [A]: 'saved', [B]: 'pending', [C]: 'uncertain', [D]: 'pending' });
    expect(made.port.mutations).toHaveLength(4);

    made.port.lastList.settle({ ok: true, value: read([bean(A, { status: 'draft' }), bean(B, { revision: 'rev-b2' }), bean(C), bean(D, { status: 'draft' })]) });
    await flush();
    // D was changed to draft elsewhere meanwhile: nothing to write. Only B is retried, on its fresh revision.
    expect(made.port.mutations).toHaveLength(5);
    expect(made.port.mutations[4]?.args).toEqual([B, 'rev-b2', { kind: 'fields', status: 'draft' }]);
    await answer(made, 4, done(B));
    await retrying;

    expect(items(made)).toEqual({ [A]: 'saved', [B]: 'saved', [C]: 'uncertain', [D]: 'unchanged' });
    expect(ids(made)).toEqual([A, B, C, D, B]);

    // C is retried only after the user checked it, and only then does the state accept writes to it again.
    await made.state.retryBulk();
    expect(made.port.mutations).toHaveLength(5);
    made.state.reconcileBulk(C);
    expect(made.state.getSnapshot().saves.has(C)).toBe(false);
    const again = made.state.retryBulk();
    await flush();
    made.port.lastList.settle({ ok: true, value: read([bean(A, { status: 'draft' }), bean(B, { status: 'draft' }), bean(C), bean(D, { status: 'draft' })]) });
    await flush();
    expect(ids(made)).toEqual([A, B, C, D, B, C]);
    await answer(made, 5, done(C));
    await again;
    expect(items(made)[C]).toBe('saved');
  });

  it('writes nothing when the re-read for a retry fails, and keeps the earlier outcomes', async () => {
    const made = await loaded([bean(A), bean(B)]);
    made.state.setSelected([A, B]);
    const running = made.state.applyBulk(status('draft'));
    await flush();
    await answer(made, 0, done(A));
    await answer(made, 1, { ok: false, error: timeout });
    await running;

    const retrying = made.state.retryBulk();
    await flush();
    made.port.lastList.settle({ ok: false, error: backend('failed', 'gone') });
    await retrying;

    expect(made.port.mutations).toHaveLength(2);
    expect(items(made)).toEqual({ [A]: 'saved', [B]: 'failed' });
    expect(made.state.getSnapshot().bulk).toMatchObject({ phase: 'done', rereadFailed: true });
  });

  it('cancels between beans: the bean in flight reports its real outcome and the rest are reported as not run', async () => {
    const made = await loaded([bean(A), bean(B), bean(C)]);
    made.state.setSelected([A, B, C]);
    const running = made.state.applyBulk(status('draft'));
    await flush();

    made.state.cancelBulk();
    expect(made.state.getSnapshot().bulk?.phase).toBe('cancelling');
    expect(items(made)).toEqual({ [A]: 'running', [B]: 'cancelled', [C]: 'cancelled' });

    await answer(made, 0, done(A));
    await running;

    expect(made.port.mutations).toHaveLength(1);
    expect(items(made)).toEqual({ [A]: 'saved', [B]: 'cancelled', [C]: 'cancelled' });
    expect(made.state.getSnapshot().bulk?.phase).toBe('done');
  });

  it('keeps its targets when the selection changes, and reports a bean that disappeared as skipped', async () => {
    const made = await loaded([bean(A), bean(B), bean(C)]);
    made.state.setSelected([A, B]);
    const running = made.state.applyBulk(status('draft'));
    await flush();

    made.state.clearSelection();
    made.state.setSelected([C]);
    const refreshing = made.state.refresh();
    made.port.lastList.settle({ ok: true, value: read([bean(A), bean(C)]) });
    await refreshing;
    await answer(made, 0, done(A));
    await running;

    expect(items(made)).toEqual({ [A]: 'saved', [B]: 'skipped' });
    expect(made.state.getSnapshot().bulk?.items[1]).toMatchObject({ reason: 'unknown-bean' });
    expect(ids(made)).toEqual([A]);
  });

  it('skips a bean whose own save is pending or unreconciled instead of writing twice', async () => {
    const made = await loaded([bean(A), bean(B)]);
    void made.state.mutate(A, { kind: 'fields', priority: 'high' });
    made.state.setSelected([A, B]);

    const running = made.state.applyBulk(status('draft'));
    await flush();
    await answer(made, 1, done(B));
    await running;

    expect(items(made)).toEqual({ [A]: 'skipped', [B]: 'saved' });
    expect(made.state.getSnapshot().bulk?.items[0]).toMatchObject({ reason: 'busy' });
  });

  it('starts nothing without a selection or while a run is still shown, and closes only a finished run', async () => {
    const made = await loaded([bean(A)]);
    expect(await made.state.applyBulk(status('draft'))).toBe(false);

    made.state.setSelected([A]);
    const running = made.state.applyBulk(status('draft'));
    await flush();
    expect(await made.state.applyBulk(status('done'))).toBe(false);
    made.state.dismissBulk();
    expect(made.state.getSnapshot().bulk).not.toBeNull();

    await answer(made, 0, done(A));
    await running;
    expect(await made.state.applyBulk(status('draft'))).toBe(false);
    made.state.dismissBulk();
    expect(made.state.getSnapshot().bulk).toBeNull();
    expect(made.port.mutations).toHaveLength(1);
  });

  it('stops writing after dispose', async () => {
    const made = await loaded([bean(A), bean(B)]);
    made.state.setSelected([A, B]);
    const running = made.state.applyBulk(status('draft'));
    await flush();

    await made.state.dispose();
    await answer(made, 0, done(A));
    await running;

    expect(made.port.mutations).toHaveLength(1);
    expect(await made.state.applyBulk(status('draft'))).toBe(false);
  });
});
