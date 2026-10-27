import { describe, expect, it } from 'vitest';
import { A, backend, detail, harness } from './support.ts';

describe('reading one bean', () => {
  it('exposes the creation defaults it was built with', () => {
    expect(harness().state.defaults).toEqual({ status: 'todo', type: 'task', priority: 'normal' });
  });

  it('returns the adapter answer for the full ID', async () => {
    const { state, port } = harness();
    const reading = state.detail(A);

    expect(port.gets[0]?.args).toEqual([A]);
    port.gets[0]?.settle({ ok: true, value: detail(A) });

    expect(await reading).toEqual({ ok: true, value: detail(A) });
  });

  it('passes a missing bean and a backend failure on as they are', async () => {
    const { state, port } = harness();
    const missing = state.detail(A);
    port.gets[0]?.settle({ ok: true, value: null });
    const failing = state.detail(A);
    port.gets[1]?.settle({ ok: false, error: backend('timeout') });

    expect(await missing).toEqual({ ok: true, value: null });
    expect(await failing).toMatchObject({ ok: false, error: { kind: 'backend', code: 'timeout' } });
  });

  it('turns a rejected port call into a backend failure instead of throwing', async () => {
    const { state, port } = harness();
    const reading = state.detail(A);
    port.gets[0]?.reject(new Error('boom'));

    expect(await reading).toMatchObject({ ok: false, error: { kind: 'backend', code: 'failed', message: 'boom' } });
  });
});
