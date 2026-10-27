// @vitest-environment jsdom
import { mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { InsertMode, InsertOutcome, NoteTarget } from '../../src/views/host.ts';
import ConvertDialog from '../../src/views/ConvertDialog.svelte';
import LinkDialog from '../../src/views/LinkDialog.svelte';
import { en } from '../../src/views/messages.en.ts';
import { openConvertDialog, openLinkDialog } from '../../src/views/note-modal.ts';
import { App, bridge } from '../support/obsidian.ts';
import { A, B, bean, detail, loaded, type Harness } from '../state/support.ts';
import { beans, mounts, open, rejected, settle, TestHost, writeText } from './ui.ts';

/** A note target the test drives: it records every write and answers with the outcome the test chose. */
class FakeTarget implements NoteTarget {
  notePath = 'Notes/Shopping.md';
  noteLink = '[[Shopping]]';
  text: string;
  outcome: InsertOutcome = 'inserted';
  readonly inserts: [string, string, InsertMode][] = [];

  constructor(text = 'Buy milk and eggs') {
    this.text = text;
  }

  link(id: string, title: string): string {
    return `[[${id}|${title}]]`;
  }

  insert(id: string, title: string, mode: InsertMode): InsertOutcome {
    this.inserts.push([id, title, mode]);
    return this.outcome;
  }
}

async function dialog(Component: typeof ConvertDialog, made: Harness, target = new FakeTarget()) {
  const host = new TestHost(made.state);
  const onClose = vi.fn();
  const el = document.body.appendChild(document.createElement('div'));
  mounts.push(mount(Component, { target: el, props: { host, target, onClose } }));
  await settle();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the element type it expects
  const q = <T extends HTMLElement>(selector: string): T => {
    const found = el.querySelector<T>(selector);
    if (!found) throw new Error(`Nothing matches ${selector}`);
    return found;
  };
  const press = async (label: string): Promise<void> => {
    const found = [...el.querySelectorAll('button')].find((one) => one.textContent.replace(/\s+/g, ' ').trim() === label);
    if (!found) throw new Error(`No button "${label}"`);
    found.click();
    await settle();
  };
  const type = async (selector: string, value: string): Promise<void> => {
    const input = q<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const choose = async (value: string): Promise<void> => {
    const radio = q<HTMLInputElement>(`input[type="radio"][value="${value}"]`);
    radio.click();
    await settle();
  };
  const answer = async (outcome: Parameters<Harness['port']['creations'][number]['settle']>[0]): Promise<void> => {
    made.port.creations.at(-1)?.settle(outcome);
    await settle();
  };
  return { el, host, target, onClose, q, press, type, choose, answer, port: made.port, state: made.state };
}

const created = (id: string, title: string) => ({ ok: true as const, value: detail(id, { title }) });
const SELECTION = '- [ ] Call the bank\nabout the card';

describe('converting a selection', () => {
  it('proposes a title and a description from the selection and creates nothing until confirmed', async () => {
    const ui = await dialog(ConvertDialog, await loaded(beans()), new FakeTarget(SELECTION));

    expect(ui.q<HTMLInputElement>('#convert-title').value).toBe('Call the bank');
    expect(ui.q<HTMLTextAreaElement>('#convert-body').value).toBe(`${SELECTION}\n\nSource: [[Shopping]]`);
    expect(ui.q<HTMLSelectElement>('#convert-status').options[0]?.textContent).toBe('Project default (todo)');
    expect(ui.q<HTMLInputElement>('input[value="after"]').checked).toBe(true);
    expect(ui.el.textContent).toContain('Notes/Shopping.md');

    await ui.press(en['create.cancel']);
    expect(ui.onClose).toHaveBeenCalledTimes(1);
    expect(ui.port.creations).toHaveLength(0);
    expect(ui.target.inserts).toEqual([]);
  });

  it('creates the bean with the confirmed values, then links it after the selected text', async () => {
    const ui = await dialog(ConvertDialog, await loaded(beans()), new FakeTarget(SELECTION));
    await ui.type('#convert-title', '  Call the bank today ');
    await ui.choose('after');

    await ui.press(en['convert.submit']);
    expect(ui.port.creations[0]?.args).toEqual([{ title: 'Call the bank today', body: `${SELECTION}\n\nSource: [[Shopping]]` }]);
    expect(ui.target.inserts).toEqual([]);
    await ui.answer(created('FX-newnew', 'Call the bank today'));

    expect(ui.target.inserts).toEqual([['FX-newnew', 'Call the bank today', 'after']]);
    expect(ui.el.textContent).toContain(en['convert.createdLinked'].replace('{id}', 'FX-newnew'));
    await ui.press(en['convert.open']);
    expect(ui.host.issues).toEqual(['FX-newnew']);
    await ui.press(en['note.close']);
    expect(ui.onClose).toHaveBeenCalledTimes(1);
  });

  it('sends the chosen fields, and replaces the selection only when asked to', async () => {
    const ui = await dialog(ConvertDialog, await loaded(beans()), new FakeTarget('Short'));
    for (const [id, value] of [['type', 'bug'], ['status', 'draft'], ['priority', 'high']] as const) {
      const select = ui.q<HTMLSelectElement>(`#convert-${id}`);
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await ui.choose('replace');

    await ui.press(en['convert.submit']);
    expect(ui.port.creations[0]?.args).toEqual([{ title: 'Short', type: 'bug', status: 'draft', priority: 'high', body: 'Source: [[Shopping]]' }]);
    await ui.answer(created('FX-newnew', 'Short'));
    expect(ui.target.inserts).toEqual([['FX-newnew', 'Short', 'replace']]);
  });

  it('leaves the note alone when asked to', async () => {
    const ui = await dialog(ConvertDialog, await loaded(beans()));
    await ui.choose('none');

    await ui.press(en['convert.submit']);
    await ui.answer(created('FX-newnew', 'Buy milk and eggs'));

    expect(ui.target.inserts).toEqual([]);
    expect(ui.el.textContent).toContain(en['convert.created'].replace('{id}', 'FX-newnew'));
  });

  it('does not submit without a title, and submits with Enter', async () => {
    const ui = await dialog(ConvertDialog, await loaded(beans()));
    await ui.type('#convert-title', '   ');
    expect(ui.q<HTMLButtonElement>('button.mod-cta').disabled).toBe(true);
    ui.q('#convert-title').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(ui.port.creations).toHaveLength(0);

    await ui.type('#convert-title', 'Named');
    ui.q('#convert-title').dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    ui.q('#convert-title').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(ui.port.creations).toHaveLength(1);
  });

  it('keeps the bean and offers the link again when the note changed, without creating twice', async () => {
    const target = new FakeTarget();
    target.outcome = 'changed';
    const ui = await dialog(ConvertDialog, await loaded(beans()), target);
    await ui.press(en['convert.submit']);
    await ui.answer(created('FX-newnew', 'Buy milk and eggs'));

    expect(ui.el.textContent).toContain(en['convert.createdNotLinked'].replace('{id}', 'FX-newnew'));
    expect(ui.q('[role="alert"]').textContent).toContain(en['note.changed']);
    expect(ui.q<HTMLInputElement>('#insert-link').value).toBe('[[FX-newnew|Buy milk and eggs]]');
    expect(ui.el.querySelector('#convert-title')).toBeNull();

    await ui.press(en['note.copyLink']);
    expect(writeText).toHaveBeenCalledWith('[[FX-newnew|Buy milk and eggs]]');
    expect(ui.el.textContent).toContain(en['note.copied']);

    await ui.press(en['note.retry']);
    expect(target.inserts).toHaveLength(2);
    target.outcome = 'inserted';
    await ui.press(en['note.retry']);
    expect(target.inserts).toHaveLength(3);
    expect(ui.el.textContent).toContain(en['convert.createdLinked'].replace('{id}', 'FX-newnew'));
    expect(ui.port.creations).toHaveLength(1);
  });

  it('says so when the note is no longer open, and when the clipboard is unavailable', async () => {
    const target = new FakeTarget();
    target.outcome = 'gone';
    const ui = await dialog(ConvertDialog, await loaded(beans()), target);
    await ui.press(en['convert.submit']);
    await ui.answer(created('FX-newnew', 'Buy milk and eggs'));
    writeText.mockRejectedValueOnce(new Error('denied'));

    expect(ui.q('[role="alert"]').textContent).toContain(en['note.gone']);
    await ui.press(en['note.copyLink']);
    expect(ui.el.textContent).toContain(en['copy.failed']);
  });

  it('shows a rejected creation, writes nothing to the note, and forgets it when closed', async () => {
    const made = await loaded(beans());
    const ui = await dialog(ConvertDialog, made);
    await ui.press(en['convert.submit']);
    await ui.answer(rejected('bad type'));

    expect(ui.q('[role="alert"]').textContent).toContain('bad type');
    expect(ui.target.inserts).toEqual([]);
    expect(made.state.getSnapshot().saves.has('new:convert')).toBe(true);
    expect(ui.q<HTMLButtonElement>('button.mod-cta').disabled).toBe(false);

    await ui.press(en['create.cancel']);
    // Closing the modal unmounts the dialog; the unsaved attempt must not linger in the project's save list.
    await unmount(mounts.splice(0)[0] as never);
    expect(made.state.getSnapshot().saves.has('new:convert')).toBe(false);
  });

  it('locks the form while a creation is pending or uncertain, so it cannot create twice', async () => {
    const made = await loaded(beans());
    const ui = await dialog(ConvertDialog, made);
    await ui.press(en['convert.submit']);

    expect(ui.q<HTMLButtonElement>('button.mod-cta').disabled).toBe(true);
    expect(ui.q<HTMLButtonElement>('button:not(.mod-cta)').disabled).toBe(true);

    await ui.answer({ ok: false, error: { kind: 'uncertain', message: 'lost', current: null, createdIds: ['FX-maybe'] } });
    expect(ui.q<HTMLButtonElement>('button.mod-cta').disabled).toBe(true);
    expect(ui.el.textContent).toContain('FX-maybe');

    await ui.press(en['save.reconciled']);
    expect(ui.q<HTMLButtonElement>('button.mod-cta').disabled).toBe(false);
    expect(ui.port.creations).toHaveLength(1);
  });

  it('explains when no project is bound', async () => {
    const made = await loaded(beans());
    const host = new TestHost(made.state);
    host.state = undefined as never;
    host.bindingText = 'Not bound.';
    const el = document.body.appendChild(document.createElement('div'));
    const onClose = vi.fn();
    mounts.push(mount(ConvertDialog, { target: el, props: { host, target: new FakeTarget(), onClose } }));
    await settle();

    expect(el.textContent).toContain('Not bound.');
    el.querySelector('button')?.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('inserting a bean link', () => {
  it('links the chosen bean after the cursor or selection and closes', async () => {
    const ui = await dialog(LinkDialog, await loaded(beans()));
    expect(ui.el.textContent).toContain('Notes/Shopping.md');

    await ui.type('input[type="search"]', 'beta');
    ui.q<HTMLButtonElement>('ul button').click();
    await settle();

    expect(ui.target.inserts).toEqual([[B, 'Beta', 'after']]);
    expect(ui.onClose).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when cancelled', async () => {
    const ui = await dialog(LinkDialog, await loaded(beans()));
    await ui.press(en['picker.cancel']);

    expect(ui.target.inserts).toEqual([]);
    expect(ui.onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps a recoverable link when the note changed, and retries the same bean', async () => {
    const target = new FakeTarget();
    target.outcome = 'changed';
    const ui = await dialog(LinkDialog, await loaded(beans()), target);
    ui.q<HTMLButtonElement>('ul button').click();
    await settle();

    expect(ui.onClose).not.toHaveBeenCalled();
    expect(ui.q('[role="alert"]').textContent).toContain(en['note.changed']);
    expect(ui.q<HTMLInputElement>('#insert-link').value).toBe(`[[${A}|Alpha]]`);

    target.outcome = 'inserted';
    await ui.press(en['note.retry']);
    expect(target.inserts).toEqual([[A, 'Alpha', 'after'], [A, 'Alpha', 'after']]);
    expect(ui.onClose).toHaveBeenCalledTimes(1);
  });

  it('explains when no project is bound', async () => {
    const made = await loaded([bean(A)]);
    const host = new TestHost(made.state);
    host.state = undefined as never;
    const el = document.body.appendChild(document.createElement('div'));
    const onClose = vi.fn();
    mounts.push(mount(LinkDialog, { target: el, props: { host, target: new FakeTarget(), onClose } }));
    await settle();

    el.querySelector('button')?.click();
    expect(el.textContent).toContain(en['link.title']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('linked notes in the inspector', () => {
  it('lists the notes Obsidian resolves, opens one, and follows changes', async () => {
    const ui = await open(await loaded(beans()));
    ui.host.notes = [{ kind: 'backlink', path: 'Notes/A.md' }, { kind: 'link', path: 'Docs/B.md' }];
    await ui.show(A);

    const section = ui.q('.pane-detail section[aria-labelledby^="notes-"]');
    expect(section.querySelector('h3')?.textContent).toBe(en['notes.heading']);
    expect([...section.querySelectorAll('li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      `Notes/A ${en['notes.backlink']}`,
      `Docs/B ${en['notes.link']}`,
    ]);

    section.querySelector('button')?.click();
    await settle();
    expect(ui.host.notesOpened).toEqual(['Notes/A.md']);
    expect(section.textContent).not.toContain(en['notes.missing']);

    ui.host.noteFound = false;
    section.querySelector('button')?.click();
    await settle();
    expect(section.textContent).toContain(en['notes.missing']);

    ui.host.notes = [];
    ui.host.views.notify();
    await settle();
    expect(section.textContent).toContain(en['notes.none']);
  });
});

describe('the Obsidian modals', () => {
  it('draw the dialog when opened and release it when closed, from the dialog itself too', async () => {
    const host = new TestHost((await loaded(beans())).state);
    const app = bridge<Parameters<typeof openLinkDialog>[0]>(new App());

    const link = openLinkDialog(app, host, new FakeTarget());
    expect(link.contentEl.querySelector('h2')?.textContent).toBe(en['link.title']);
    [...link.contentEl.querySelectorAll('button')].find((one) => one.textContent === en['picker.cancel'])?.click();
    expect(link.contentEl.childElementCount).toBe(0);

    const convert = openConvertDialog(app, host, new FakeTarget());
    expect(convert.contentEl.querySelector('h2')?.textContent).toBe(en['convert.title']);
    [...convert.contentEl.querySelectorAll('button')].find((one) => one.textContent === en['create.cancel'])?.click();
    expect(convert.contentEl.childElementCount).toBe(0);
  });
});
