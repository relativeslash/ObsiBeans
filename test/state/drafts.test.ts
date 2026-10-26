import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_DRAFTS, MAX_DRAFT_CHARS, parseDrafts, upsertDraft } from '../../src/state/drafts.ts';
import type { Draft } from '../../src/state/model.ts';
import { A, B, backend, bean, detail, harness, loaded, read } from './support.ts';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const SAVED_AT = '2026-10-26T20:00:00.000Z';
const draft = (key: string, extra: Partial<Draft> = {}): Draft => ({ kind: 'description', key, text: 'text', revision: `rev-${key}`, savedAt: SAVED_AT, ...extra });

describe('stored drafts', () => {
  it('reads valid entries and skips ones it cannot show, whatever the neighbours look like', () => {
    const stored: unknown[] = [
      draft(A),
      null,
      'text',
      { kind: 'other', key: B, text: 'x' },
      { kind: 'description', key: '', text: 'x' },
      { kind: 'description', key: B, text: 4 },
      { kind: 'creation', key: 'form-1', text: 'new', revision: 5, savedAt: 7 },
      draft(A, { text: 'duplicate' }),
    ];

    expect(parseDrafts(stored)).toEqual([draft(A), { kind: 'creation', key: 'form-1', text: 'new', revision: null, savedAt: '' }]);
    expect(parseDrafts(undefined)).toEqual([]);
    expect(parseDrafts({ not: 'a list' })).toEqual([]);
  });

  it('bounds what a damaged file can load', () => {
    const many = Array.from({ length: MAX_DRAFTS + 50 }, (_, index) => draft(`FX-${String(index)}`));

    expect(parseDrafts(many)).toHaveLength(MAX_DRAFTS);
    expect(parseDrafts([draft(A, { text: 'x'.repeat(MAX_DRAFT_CHARS + 10) })])[0]?.text).toHaveLength(MAX_DRAFT_CHARS);
  });

  it('refuses a new draft when the list is full instead of dropping stored text, but still updates an existing one', () => {
    const full = Array.from({ length: MAX_DRAFTS }, (_, index) => draft(`FX-${String(index)}`));

    expect(upsertDraft(full, draft('FX-new'))).toBeUndefined();
    expect(upsertDraft(full, draft('FX-3', { text: 'edited' }))?.[3]?.text).toBe('edited');
  });
});

describe('draft recovery', () => {
  it('records a draft with its basis revision and time, and writes it after the quiet period', async () => {
    const { state, stored } = await loaded([bean(A)]);

    expect(state.setDraft('description', A, 'half a sentence', `rev-${A}`)).toBe(true);

    expect(state.getSnapshot().drafts).toEqual([{ draft: draft(A, { text: 'half a sentence' }), status: 'current' }]);
    expect(stored).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(stored).toEqual([[draft(A, { text: 'half a sentence' })]]);
  });

  it('writes a typing burst once', async () => {
    const { state, stored } = await loaded([bean(A)]);

    for (const text of ['a', 'ab', 'abc']) {
      state.setDraft('description', A, text, `rev-${A}`);
      await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(400);

    expect(stored).toHaveLength(1);
    expect(stored[0]?.[0]?.text).toBe('abc');
  });

  it('survives a reload: a new state restores the stored draft against the same bean', async () => {
    const first = await loaded([bean(A)]);
    first.state.setDraft('description', A, 'unsaved', `rev-${A}`);
    await first.state.dispose();
    const saved = first.stored.at(-1) ?? [];

    const second = await loaded([bean(A)], {}, { drafts: saved });

    expect(second.state.restoreDraft('description', A)).toEqual({ kind: 'restore', draft: draft(A, { text: 'unsaved' }) });
  });

  it('flushes pending drafts on dispose, without waiting for the timer', async () => {
    const { state, stored } = await loaded([bean(A)]);
    state.setDraft('description', A, 'unsaved', `rev-${A}`);

    await state.dispose();

    expect(stored.at(-1)?.[0]?.text).toBe('unsaved');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a failed save\'s text as a draft, and does not discard it on conflict', async () => {
    const { state, port } = await loaded([bean(A)]);
    const saving = state.mutate(A, { kind: 'body', body: 'my text' });
    port.mutations[0]?.settle({ ok: false, error: backend('timeout') });
    await saving;

    expect(state.getSnapshot().drafts).toMatchObject([{ draft: { key: A, text: 'my text', revision: `rev-${A}` } }]);

    const conflicting = state.mutate(A, { kind: 'body', body: 'my text' });
    const current = detail(A, { revision: 'rev-new' });
    port.mutations[1]?.settle({ ok: false, error: { kind: 'conflict', code: 'revision', current } });
    await conflicting;

    expect(state.getSnapshot().drafts).toHaveLength(1);
    expect(state.getSnapshot().saves.get(A)?.kind).toBe('conflict');
  });

  it('removes the draft after a successful body save and not after other changes', async () => {
    const { state, port } = await loaded([bean(A)]);
    state.setDraft('description', A, 'text', `rev-${A}`);

    const other = state.mutate(A, { kind: 'fields', status: 'draft' });
    port.mutations[0]?.settle({ ok: true, value: detail(A) });
    await other;
    expect(state.getSnapshot().drafts).toHaveLength(1);

    const saving = state.mutate(A, { kind: 'body', body: 'text' });
    port.mutations[1]?.settle({ ok: true, value: detail(A) });
    await saving;
    expect(state.getSnapshot().drafts).toEqual([]);
  });

  it('removes a creation draft once the bean exists', async () => {
    const { state, port } = await loaded([bean(A)]);
    state.setDraft('creation', 'form-1', '{"title":"x"}', null);

    const creating = state.create('form-1', { title: 'x' });
    port.creations[0]?.settle({ ok: true, value: detail(B) });
    await creating;

    expect(state.getSnapshot().drafts).toEqual([]);
  });

  it('opens conflict review, not an overwrite, when the bean changed since the draft', async () => {
    const { state, port } = await loaded([bean(A)]);
    state.setDraft('description', A, 'old edit', `rev-${A}`);
    const refreshing = state.refresh();
    port.lastList.settle({ ok: true, value: read([bean(A, { revision: 'rev-newer' })]) });
    await refreshing;

    expect(state.getSnapshot().drafts[0]?.status).toBe('changed');
    expect(state.restoreDraft('description', A)).toMatchObject({ kind: 'conflict', current: { revision: 'rev-newer' } });
  });

  it('keeps a draft of a deleted bean listed, so its text can be copied before discarding', async () => {
    const { state, port } = await loaded([bean(A), bean(B)]);
    state.setDraft('description', B, 'precious', `rev-${B}`);
    const refreshing = state.refresh();
    port.lastList.settle({ ok: true, value: read([bean(A)]) });
    await refreshing;

    expect(state.getSnapshot().drafts).toMatchObject([{ status: 'orphaned', draft: { text: 'precious' } }]);
    expect(state.restoreDraft('description', B)).toMatchObject({ kind: 'orphaned', draft: { text: 'precious' } });
    state.discardDraft('description', B);
    expect(state.getSnapshot().drafts).toEqual([]);
  });

  it('cannot judge a draft before the project has loaded', () => {
    const { state } = harness({ drafts: [draft(A)] });

    expect(state.getSnapshot().drafts).toEqual([{ draft: draft(A), status: 'unchecked' }]);
    expect(state.restoreDraft('description', A)).toEqual({ kind: 'unavailable' });
    expect(state.restoreDraft('description', 'FX-none')).toEqual({ kind: 'unavailable' });
  });

  it('discarding a draft that does not exist writes nothing', async () => {
    const { state, stored } = await loaded([bean(A)]);

    state.discardDraft('description', A);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(stored).toEqual([]);
  });

  it('says so when drafts cannot be written, and recovers on the next write', async () => {
    let fail = true;
    const attempts: number[] = [];
    const { state } = await loaded([bean(A)], {}, {
      saveDrafts: () => {
        attempts.push(attempts.length);
        return fail ? Promise.reject(new Error('disk full')) : Promise.resolve();
      },
    });

    state.setDraft('description', A, 'text', `rev-${A}`);
    await vi.advanceTimersByTimeAsync(400);
    expect(state.getSnapshot().draftsUnsaved).toBe(true);

    fail = false;
    state.setDraft('description', A, 'more text', `rev-${A}`);
    await vi.advanceTimersByTimeAsync(400);
    expect(state.getSnapshot().draftsUnsaved).toBe(false);
    expect(attempts).toHaveLength(2);
  });

  it('never runs two draft writes at once', async () => {
    let running = 0;
    let overlapped = false;
    const { state } = await loaded([bean(A)], {}, {
      saveDrafts: async () => {
        running++;
        overlapped ||= running > 1;
        await new Promise((resolve) => setTimeout(resolve, 600));
        running--;
      },
    });

    state.setDraft('description', A, '1', null);
    await vi.advanceTimersByTimeAsync(400);
    state.setDraft('description', A, '2', null);
    await vi.advanceTimersByTimeAsync(400);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(overlapped).toBe(false);
  });

  it('reports a full draft list instead of silently dropping the text', async () => {
    const drafts = Array.from({ length: MAX_DRAFTS }, (_, index) => draft(`FX-${String(index).padStart(5, '0')}`));
    const { state } = await loaded([bean(A)], {}, { drafts });

    expect(state.setDraft('description', A, 'one too many', null)).toBe(false);
    expect(state.getSnapshot().drafts).toHaveLength(MAX_DRAFTS);
  });
});
