// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { AdapterError } from '../../src/state/model.ts';
import { en } from '../../src/views/messages.en.ts';
import { A, bean, detail, loaded } from '../state/support.ts';
import { beans, open, settle } from './ui.ts';

const form = (ui: Awaited<ReturnType<typeof open>>) => ({
  title: ui.q<HTMLInputElement>('#create-title'),
  create: () => ui.press(en['create.submit']),
});
const created = (id: string, extra: Parameters<typeof detail>[1] = {}) => ({ ok: true as const, value: detail(id, extra) });
const rejection: { ok: false; error: AdapterError } = { ok: false, error: { kind: 'validation', code: 'backend', message: 'bad type' } };

async function answerCreation(ui: Awaited<ReturnType<typeof open>>, outcome: Parameters<(typeof ui.port.creations)[number]['settle']>[0]): Promise<void> {
  ui.port.creations.at(-1)?.settle(outcome);
  await settle();
}

describe('creating a bean', () => {
  it('opens a focused form from the toolbar and from the list key, and closing it creates nothing', async () => {
    const ui = await open(await loaded(beans()));

    await ui.toolbar(en['create.open']);
    expect(document.activeElement).toBe(form(ui).title);
    expect(ui.el.querySelector('#create-type')).toBeNull();

    await ui.press(en['create.cancel']);
    expect(ui.el.querySelector('#create-title')).toBeNull();

    ui.key(ui.q(`button.row[data-id="${A}"]`), 'c');
    await settle();
    expect(ui.el.querySelector('#create-title')).not.toBeNull();
    expect(ui.port.creations).toHaveLength(0);
  });

  it('creates with project defaults, then shows the new bean in the inspector', async () => {
    const ui = await open(await loaded(beans()));
    await ui.toolbar(en['create.open']);

    await ui.text(form(ui).title, '  Brand new ');
    await form(ui).create();

    expect(ui.port.creations[0]?.args).toEqual([{ title: 'Brand new' }]);
    await answerCreation(ui, created('FX-newnew', { title: 'Brand new' }));

    expect(ui.el.querySelector('#create-title')).toBeNull();
    expect(ui.q('.inspector h2').textContent).toBe('Brand new');
    expect(ui.state.getSnapshot().selectedId).toBe('FX-newnew');
    expect(ui.drafts()).toEqual([]);
  });

  it('submits with Enter, and leaves with Escape from any field while keeping what was typed', async () => {
    const ui = await open(await loaded(beans()));
    await ui.toolbar(en['create.open']);
    await ui.text(form(ui).title, 'By keyboard');

    ui.key(form(ui).title, 'Enter');
    await settle();
    expect(ui.port.creations[0]?.args).toEqual([{ title: 'By keyboard' }]);
    await answerCreation(ui, rejection);

    ui.key(form(ui).title, 'Escape');
    await settle();
    expect(ui.el.querySelector('#create-title')).toBeNull();
    expect(ui.drafts()).toHaveLength(1);

    // The draft comes back, and only the Cancel button discards it.
    await ui.toolbar(en['create.open']);
    expect(form(ui).title.value).toBe('By keyboard');
    ui.buttonIn('.create', en['create.cancel']).click();
    await settle();
    expect(ui.drafts()).toEqual([]);
  });

  it('creates a draft explicitly, whatever the status field says', async () => {
    const ui = await open(await loaded(beans()));
    await ui.toolbar(en['create.open']);
    await ui.press(en['create.more']);
    await ui.choose(ui.q<HTMLSelectElement>('#create-status'), 'in-progress');
    await ui.text(form(ui).title, 'Capture this');

    await ui.press(en['create.draft']);

    expect(ui.port.creations[0]?.args).toEqual([{ title: 'Capture this', status: 'draft' }]);
  });

  it('shows the effective project defaults and sends every chosen field of the expanded form', async () => {
    const ui = await open(await loaded(beans()));
    await ui.toolbar(en['create.open']);
    await ui.press(en['create.more']);

    expect([...ui.q<HTMLSelectElement>('#create-status').options].at(0)?.textContent).toBe('Project default (todo)');
    expect([...ui.q<HTMLSelectElement>('#create-type').options].at(0)?.textContent).toBe('Project default (task)');
    expect([...ui.q<HTMLSelectElement>('#create-priority').options].at(0)?.textContent).toBe('Project default (normal)');

    await ui.text(form(ui).title, 'Full');
    await ui.choose(ui.q('#create-type'), 'bug');
    await ui.choose(ui.q('#create-priority'), 'high');
    await ui.text(ui.q('#create-tags'), 'a, b');
    await ui.text(ui.q('#create-body'), 'Details');
    await form(ui).create();

    expect(ui.port.creations[0]?.args).toEqual([{ title: 'Full', type: 'bug', priority: 'high', tags: ['a', 'b'], body: 'Details' }]);
    await ui.press(en['create.less']);
    expect(ui.el.querySelector('#create-type')).toBeNull();
  });

  it('keeps every field after a backend rejection and allows another attempt', async () => {
    const ui = await open(await loaded(beans()));
    await ui.toolbar(en['create.open']);
    await ui.press(en['create.more']);
    await ui.text(form(ui).title, 'Keep me');
    await ui.text(ui.q('#create-body'), 'Long text');
    await form(ui).create();

    await answerCreation(ui, rejection);

    expect(ui.q('.create [role="alert"]').textContent).toContain('Beans rejected the change: bad type');
    expect(form(ui).title.value).toBe('Keep me');
    expect(ui.q<HTMLTextAreaElement>('#create-body').value).toBe('Long text');
    await form(ui).create();
    expect(ui.port.creations).toHaveLength(2);
  });

  it('ignores a second submit while the first is pending', async () => {
    const ui = await open(await loaded(beans()));
    await ui.toolbar(en['create.open']);
    await ui.text(form(ui).title, 'Once');

    await form(ui).create();
    ui.key(form(ui).title, 'Enter');
    await settle();

    expect(ui.port.creations).toHaveLength(1);
    expect(ui.buttonIn('.create', en['create.submit']).disabled).toBe(true);
    expect(ui.q('.create').textContent).toContain(en['row.saving']);
  });

  it('blocks another attempt after an uncertain result until the user has checked, listing what appeared', async () => {
    const ui = await open(await loaded(beans()));
    await ui.toolbar(en['create.open']);
    await ui.text(form(ui).title, 'Maybe');
    await form(ui).create();

    await answerCreation(ui, { ok: false, error: { kind: 'uncertain', message: 'lost', current: null, createdIds: ['FX-maybe'] } });

    expect(ui.q('.create').textContent).toContain('Beans created: FX-maybe');
    expect(ui.buttonIn('.create', en['create.submit']).disabled).toBe(true);
    await ui.press(en['save.reconciled']);
    expect(ui.buttonIn('.create', en['create.submit']).disabled).toBe(false);
  });

  it('brings back an unsaved form after leaving it, and forgets it on cancel', async () => {
    const ui = await open(await loaded([bean(A, { title: 'Alpha' })]));
    await ui.toolbar(en['create.open']);
    await ui.press(en['create.more']);
    await ui.text(form(ui).title, 'Half typed');
    expect(ui.drafts()).toHaveLength(1);

    ui.q<HTMLElement>(`button.row[data-id="${A}"]`).click();
    await settle();
    expect(ui.el.querySelector('#create-title')).toBeNull();

    await ui.toolbar(en['create.open']);
    expect(form(ui).title.value).toBe('Half typed');
    expect(ui.el.querySelector('#create-type')).not.toBeNull();

    await ui.press(en['create.cancel']);
    expect(ui.drafts()).toEqual([]);
    await ui.toolbar(en['create.open']);
    expect(form(ui).title.value).toBe('');
  });

  it('keeps nothing for a blank form', async () => {
    const ui = await open(await loaded(beans()));
    await ui.toolbar(en['create.open']);
    await ui.text(form(ui).title, 'x');
    await ui.text(form(ui).title, '');

    expect(ui.drafts()).toEqual([]);
  });

  it('leaves the form when a view is chosen in the navigation', async () => {
    const ui = await open(await loaded(beans()));
    await ui.toolbar(en['create.open']);

    ui.buttonIn('.pane-nav', en['nav.ready']).click();
    await settle();

    expect(ui.el.querySelector('#create-title')).toBeNull();
  });
});
