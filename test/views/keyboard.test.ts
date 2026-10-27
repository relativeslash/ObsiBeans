// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import { ACTIONS, DETAIL_KEYS, LIST_KEYS, type ActionId, type ActionPort } from '../../src/views/actions.ts';
import { DEFAULT_LAYOUT } from '../../src/views/layout.ts';
import { en } from '../../src/views/messages.en.ts';
import { A, B, C, bean, loaded } from '../state/support.ts';
import { open, settle, writeText } from './ui.ts';

const beans = () => [
  bean(A, { title: 'Alpha', type: 'epic', childIds: [B], tags: ['ui'] }),
  bean(B, { title: 'Beta', parentId: A, tags: ['api'] }),
  bean(C, { title: 'Gamma', tags: ['ui'] }),
];

const opened = async (view: 'list' | 'board' | 'hierarchy' = 'list') => {
  const port: ActionPort = {};
  const ui = await open(await loaded(beans()), [], { ...DEFAULT_LAYOUT, view }, port);
  await settle();
  const press = async (key: string): Promise<void> => {
    (document.activeElement ?? ui.el).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await settle();
  };
  const row = (id: string): HTMLElement => ui.q(`button.row[data-id="${id}"]`);
  const run = async (action: ActionId): Promise<void> => {
    port.run?.(action);
    await settle();
  };
  return { ui, press, row, run, port };
};

describe('moving along the rows', () => {
  it.each(['list', 'board', 'hierarchy'] as const)('jumps with Home, End and the page keys in the %s view', async (view) => {
    const { ui, press, row } = await opened(view);
    const ids = [...ui.el.querySelectorAll<HTMLElement>('button.row')].map((one) => one.dataset.id ?? '');
    const first = ids[0] ?? '';
    const last = ids.at(-1) ?? '';
    expect(ids.length).toBeGreaterThan(1);

    row(first).focus();
    await press('End');
    expect((document.activeElement as HTMLElement).dataset.id).toBe(last);
    await press('Home');
    expect((document.activeElement as HTMLElement).dataset.id).toBe(first);
    await press('PageDown');
    expect((document.activeElement as HTMLElement).dataset.id).toBe(last);
    await press('PageUp');
    expect((document.activeElement as HTMLElement).dataset.id).toBe(first);
    await press('ArrowUp');
    expect((document.activeElement as HTMLElement).dataset.id).toBe(first);
  });
});

describe('Escape in the list', () => {
  it('clears the selection, then the tag filter, then the search text, and then does nothing', async () => {
    const { ui, press, row } = await opened();
    ui.q<HTMLInputElement>(`input[aria-label="${en['row.select'].replace('{id}', B)}"]`).click();
    ui.state.setFilters({ tags: ['ui'], search: 'a' });
    await settle();
    row(A).focus();
    const filters = () => ui.state.getSnapshot().filters;

    expect(ui.state.getSnapshot().selection.ids).toEqual([B]);
    await press('Escape');
    expect(ui.state.getSnapshot().selection.ids).toEqual([]);
    expect(filters()).toMatchObject({ tags: ['ui'], search: 'a' });
    await press('Escape');
    expect(filters()).toMatchObject({ tags: [], search: 'a' });
    await press('Escape');
    expect(filters().search).toBe('');
    await press('Escape');
    expect(ui.q('.obsibeans-workspace')).toBeTruthy();
    expect(ui.state.getSnapshot().status).toBe('ready');
  });

  it('does not touch the selection while a field has the keys', async () => {
    const { ui, press } = await opened();
    ui.state.toggleSelected(A);
    await settle();
    ui.q<HTMLInputElement>('input[type="search"]').focus();
    await press('Escape');
    await press('j');
    expect(ui.state.getSnapshot().selection.ids).toEqual([A]);
  });
});

describe('shortcut help', () => {
  it('opens with ? from the list and the inspector, returns focus, and closes with Escape, ? or Close', async () => {
    const { ui, press, row } = await opened();
    row(A).focus();
    await press('?');
    const dialog = ui.q('[role="dialog"]');
    expect(dialog.contains(document.activeElement)).toBe(true);
    await press('Tab');
    expect(dialog.contains(document.activeElement)).toBe(true);
    await press('Escape');
    expect(ui.el.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(row(A));

    await ui.show(A);
    ui.q('.inspector').focus();
    ui.key(ui.q('.inspector .actions button'), '?');
    await settle();
    expect(ui.el.querySelector('[role="dialog"]')).not.toBeNull();
    ui.key(ui.q('[role="dialog"] button'), '?');
    await settle();
    expect(ui.el.querySelector('[role="dialog"]')).toBeNull();

    await ui.toolbar(en['action.help']);
    ui.buttonIn('[role="dialog"]', en['action.close']).click();
    await settle();
    expect(ui.el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('lists exactly the keys the handlers use, with the palette name of each action', async () => {
    const { ui, press, row } = await opened();
    row(A).focus();
    await press('?');
    const shown = new Map([...ui.el.querySelectorAll('[role="dialog"] dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]));

    for (const [key, action] of [...Object.entries(LIST_KEYS), ...Object.entries(DETAIL_KEYS)]) {
      if (action !== 'help') expect(shown.get(key), key).toBe(en[`command.${action}`]);
    }
    expect(shown.get('g t')).toBe(en['command.tags']);
    expect(shown.get('?')).toBe(en['command.help']);
    // Letter paging keys are intentionally not offered (TP-03).
    for (const absent of ['h', 'l', 'u', 'd', 'f', 'G']) expect(shown.has(absent)).toBe(false);
  });

  it('is not opened by ? typed into a field', async () => {
    const { ui, press } = await opened();
    ui.q<HTMLInputElement>('input[type="search"]').focus();
    await press('?');
    expect(ui.el.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('palette actions', () => {
  it('reach every action through the view, with the same effect as the keys and controls', async () => {
    writeText.mockResolvedValue(undefined);
    const { ui, run } = await opened();
    const done = new Set<ActionId>();
    const check = async (action: ActionId, expectation: () => void): Promise<void> => {
      await run(action);
      expectation();
      done.add(action);
    };
    const pressed = (label: string): string | null => ui.buttonIn('.controls', label).getAttribute('aria-pressed');

    await check('search', () => { expect(document.activeElement).toBe(ui.q('input[type="search"]')); });
    await check('tags', () => { expect(ui.q<HTMLDetailsElement>('details.filters').open).toBe(true); });
    await check('selectAll', () => { expect(ui.state.getSnapshot().selection.ids).toHaveLength(3); });
    await check('copy', () => { expect(writeText).toHaveBeenLastCalledWith(`${A}\n${B}\n${C}`); });
    await check('clearSelection', () => { expect(ui.state.getSnapshot().selection.ids).toEqual([]); });
    await check('viewBoard', () => { expect(pressed(en['view.board'])).toBe('true'); });
    await check('viewHierarchy', () => { expect(pressed(en['view.hierarchy'])).toBe('true'); });
    await check('viewList', () => { expect(pressed(en['view.list'])).toBe('true'); });
    await check('new', () => { expect(ui.el.querySelector('#create-title')).not.toBeNull(); });
    ui.buttonIn('.create', en['create.cancel']).click();
    await settle();

    await ui.show(A);
    await check('status', () => { expect(document.activeElement).toBe(ui.field('status')); });
    await check('type', () => { expect(document.activeElement).toBe(ui.field('type')); });
    await check('priority', () => { expect(document.activeElement).toBe(ui.field('priority')); });
    await check('edit', () => { expect(ui.el.querySelector('.inspector textarea')).not.toBeNull(); });
    await check('parent', () => { expect(ui.el.querySelector('.picker')).not.toBeNull(); });
    ui.key(ui.q('.picker input'), 'Escape');
    await settle();
    await check('blocks', () => { expect(ui.el.querySelector('.picker')).not.toBeNull(); });
    ui.key(ui.q('.picker input'), 'Escape');
    await settle();
    await check('openSource', () => { expect(ui.host.sources).toEqual([A]); });
    await check('copyLink', () => { expect(writeText).toHaveBeenLastCalledWith(ui.host.link); });
    await check('help', () => { expect(ui.el.querySelector('[role="dialog"]')).not.toBeNull(); });
    ui.key(ui.q('[role="dialog"] button'), 'Escape');
    await settle();
    // Back needs somewhere to go: follow a link, then return.
    ui.buttonIn('.inspector', `${B} Beta`).click();
    await settle();
    expect(ui.q('.inspector h2').textContent).toBe('Beta');
    await check('back', () => { expect(ui.q('.inspector h2').textContent).toBe('Alpha'); });

    expect([...done].sort()).toEqual([...ACTIONS].sort());
  });
});

describe('Escape in the inspector', () => {
  it('goes back along the visited path, but not out of a text field or a picker', async () => {
    const { ui } = await opened();
    await ui.show(A);
    ui.buttonIn('.inspector', `${B} Beta`).click();
    await settle();
    expect(ui.q('.inspector h2').textContent).toBe('Beta');

    ui.key(ui.field<HTMLInputElement>('title', B), 'Escape');
    expect(ui.q('.inspector h2').textContent).toBe('Beta');

    ui.key(ui.q('.inspector .actions button'), 'p');
    await tick();
    ui.key(ui.q('.picker input'), 'Escape');
    await settle();
    expect(ui.el.querySelector('.picker')).toBeNull();
    expect(ui.q('.inspector h2').textContent).toBe('Beta');

    ui.key(ui.q('.inspector .actions button'), 'Escape');
    await settle();
    expect(ui.q('.inspector h2').textContent).toBe('Alpha');
  });
});

/** The accessible name an assistive technology would compute, in the order that matters here. */
function nameOf(el: HTMLElement): string {
  const labelled = el.getAttribute('aria-labelledby')?.split(' ').map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '').join(' ');
  const labels = 'labels' in el ? [...(el as HTMLInputElement).labels ?? []].map((one) => one.textContent).join(' ') : '';
  // Only buttons and summaries are named by their content; a select's text is its options.
  const content = el.matches('button, summary') ? el.textContent : '';
  return [el.getAttribute('aria-label'), labelled, labels, content].find((candidate) => candidate && candidate.trim() !== '')?.trim() ?? '';
}

describe('accessible names', () => {
  it.each(['list', 'board', 'hierarchy'] as const)('every control in the %s view, inspector, help and creation form has a name', async (view) => {
    const { ui, run } = await opened(view);
    await ui.show(A);
    await run('help');
    const unnamed = (): string[] =>
      [...ui.el.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, [role="separator"], [role="dialog"], [role="group"]')]
        .filter((el) => nameOf(el) === '')
        .map((el) => el.outerHTML.slice(0, 80));

    expect(unnamed()).toEqual([]);
    ui.key(ui.q('[role="dialog"] button'), 'Escape');
    await run('new');
    expect(unnamed()).toEqual([]);
  });
});

describe('styling guards', () => {
  const files = (dir: string): string[] => readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.svelte')).map((name) => `${dir}/${name}`);
  const sources = files('src/views').map((path) => [path, readFileSync(path, 'utf8')] as const);

  it('uses no motion, so reduced-motion preferences are met by default', () => {
    for (const [path, text] of sources) expect(text, path).not.toMatch(/\b(transition|animation|animate|scroll-behavior)\b|svelte\/(transition|animate|motion)/);
  });

  it('takes every color from the Obsidian theme, so light and dark themes apply', () => {
    for (const [path, text] of sources) expect(text, path).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/i);
  });
});
