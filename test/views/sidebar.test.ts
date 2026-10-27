// @vitest-environment jsdom
import { mount, tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import { en } from '../../src/views/messages.en.ts';
import Sidebar from '../../src/views/Sidebar.svelte';
import { A, B, backend, bean, C, harness, loaded, read } from '../state/support.ts';
import { mounts, settle, TestHost } from './ui.ts';

const data = () => [
  bean(A, { title: 'Alpha', status: 'in-progress' }),
  bean(B, { title: 'Beta', status: 'todo' }),
  bean(C, { title: 'Gamma', status: 'todo' }),
];

function show(made: ReturnType<typeof harness>) {
  const host = new TestHost(made.state);
  const el = document.body.appendChild(document.createElement('div'));
  mounts.push(mount(Sidebar, { target: el, props: { host } }));
  const lists = (): Record<string, string[]> =>
    Object.fromEntries([...el.querySelectorAll('h2')].map((heading) => [
      (heading.firstChild?.textContent ?? '').trim(),
      [...el.querySelectorAll<HTMLElement>(`ul[aria-labelledby="${heading.id}"] button`)].map((row) => row.dataset.id ?? ''),
    ]));
  return { host, el, lists, state: made.state, port: made.port };
}

describe('ready and in-progress sidebar', () => {
  it('lists beans the backend calls ready and beans in progress, whatever the workspace filters', async () => {
    const made = await loaded(data(), { readyIds: [B, C], blockedIds: [] });
    const ui = show(made);
    await tick();
    made.state.setFilters({ search: 'nothing matches this' });
    await tick();

    expect(ui.lists()).toEqual({ [en['nav.ready']]: [B, C], [en['nav.in-progress']]: [A] });
    expect(ui.el.textContent).toContain(en['status.connected']);
  });

  it('keeps a bean the status says is todo out of Ready when the backend says it is blocked', async () => {
    const ui = show(await loaded(data(), { readyIds: [C], blockedIds: [B] }));
    await tick();
    expect(ui.lists()[en['nav.ready']]).toEqual([C]);
  });

  it('follows external changes after a refresh', async () => {
    const ui = show(await loaded(data(), { readyIds: [B, C] }));
    await tick();

    const refreshed = ui.state.refresh();
    ui.port.lastList.settle({ ok: true, value: read([bean(A, { status: 'todo' }), bean(B, { status: 'in-progress' }), bean(C, { status: 'completed' })], { readyIds: [A] }) });
    await refreshed;
    await settle();

    expect(ui.lists()).toEqual({ [en['nav.ready']]: [A], [en['nav.in-progress']]: [B] });
  });

  it('opens the bean in its issue tab', async () => {
    const ui = show(await loaded(data(), { readyIds: [B] }));
    await tick();
    ui.el.querySelector<HTMLElement>(`button[data-id="${B}"]`)?.click();
    expect(ui.host.issues).toEqual([B]);
  });

  it('says nothing is bound, loading, empty, stale and disconnected instead of drawing empty lists', async () => {
    const made = harness();
    const ui = show(made);
    void made.state.start();
    await tick();
    expect(ui.el.textContent).toContain(en['list.loading']);

    made.port.lastList.settle({ ok: false, error: backend('failed', 'gone') });
    await settle();
    expect(ui.el.querySelector('[role="alert"]')?.textContent).toContain('gone');
    expect(ui.el.querySelector('h2')).toBeNull();
    expect(ui.el.textContent).toContain(en['status.disconnected']);

    const retry = [...ui.el.querySelectorAll('button')].find((one) => one.textContent === en['action.retry']);
    retry?.click();
    ui.port.lastList.settle({ ok: true, value: read(data(), { readyIds: [B] }) });
    await settle();
    expect(ui.lists()[en['nav.ready']]).toEqual([B]);

    const stale = ui.state.refresh();
    ui.port.lastList.settle({ ok: false, error: backend('failed', 'offline') });
    await stale;
    await settle();
    expect(ui.lists()[en['nav.ready']]).toEqual([B]);
    expect(ui.el.querySelector('[role="alert"]')?.textContent).toContain('offline');
    expect(ui.el.textContent).toContain(en['status.stale']);

    const empty = show(await loaded([]));
    await tick();
    expect(empty.el.textContent).toContain(en['list.empty']);
  });

  it('follows a rebind to a new project state', async () => {
    const first = await loaded(data(), { readyIds: [B] });
    const ui = show(first);
    await tick();
    const second = await loaded([bean(C, { title: 'Gamma' })], { readyIds: [C] });

    ui.host.state = second.state;
    ui.host.views.notify();
    await settle();

    expect(ui.lists()[en['nav.ready']]).toEqual([C]);
  });
});
