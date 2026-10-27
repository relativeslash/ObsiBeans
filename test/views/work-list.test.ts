// @vitest-environment jsdom
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import type { Layout } from '../../src/views/layout.ts';
import { DEFAULT_LAYOUT } from '../../src/views/layout.ts';
import { en } from '../../src/views/messages.en.ts';
import Workspace from '../../src/views/Workspace.svelte';
import type { WorkspaceHost } from '../../src/views/host.ts';
import { A, B, C, bean, detail, harness, loaded, read, type Harness } from '../state/support.ts';

let mounted: ReturnType<typeof mount> | undefined;
afterEach(() => {
  if (mounted) void unmount(mounted);
  mounted = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
});

/** Mounts the workspace over a started state; returns the saved layout so persistence can be checked. */
async function open(made: Harness, layout: Layout = DEFAULT_LAYOUT) {
  const host: WorkspaceHost = {
    state: made.state,
    bindingText: '',
    density: 'comfortable',
    savedViews: [],
    changeViews: () => Promise.resolve({ ok: true, entries: [] }),
    onBindingChange: () => () => undefined,
    openIssue: () => Promise.resolve(),
    renderMarkdown: () => () => undefined,
    openSource: () => Promise.resolve(true),
    sourceLink: () => undefined,
    relatedNotes: () => [],
    openNote: () => Promise.resolve(true),
  };
  const saved: Layout[] = [];
  const el = document.body.appendChild(document.createElement('div'));
  mounted = mount(Workspace, { target: el, props: { host, layout, onLayout: (next: Layout) => { saved.push(next); }, onClose: () => undefined } });
  await tick();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the element type it expects
  const q = <T extends HTMLElement>(selector: string): T => {
    const found = el.querySelector<T>(selector);
    if (!found) throw new Error(`Nothing matches ${selector}`);
    return found;
  };
  const button = (label: string): HTMLButtonElement => {
    const found = [...el.querySelectorAll('button')].find((one) => one.textContent.replace(/\s+/g, ' ').trim() === label);
    if (!found) throw new Error(`No button "${label}"`);
    return found;
  };
  const rows = (): string[] => [...el.querySelectorAll<HTMLElement>('button.row')].map((row) => `${row.dataset.id ?? ''}${row.dataset.context === undefined ? '' : '*'}`);
  const type = async (text: string): Promise<void> => {
    const input = q<HTMLInputElement>('input[type="search"]');
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
  };
  const click = async (target: HTMLElement): Promise<void> => { target.click(); await tick(); };
  return { el, q, button, rows, type, click, saved, state: made.state };
}

const beans = () => [
  bean(A, { title: 'Alpha', type: 'epic', childIds: [B], tags: ['ui'] }),
  bean(B, { title: 'Beta', parentId: A, tags: ['api'] }),
  bean(C, { title: 'Gamma', tags: ['api', 'ui'] }),
];

describe('search and filters', () => {
  it('searches as plain text, tells zero matches from an empty project, and clears and resets', async () => {
    const ui = await open(await loaded(beans()));

    await ui.type('gam');
    expect(ui.rows()).toEqual([C]);
    expect(ui.el.textContent).toContain('1 match of 3');

    await ui.type('nothing');
    expect(ui.el.textContent).toContain(en['list.noMatches']);
    expect(ui.el.textContent).not.toContain(en['list.empty']);
    expect(ui.q('input[type="search"]')).toBeTruthy();

    await ui.click(ui.button(en['list.search.clear']));
    expect(ui.rows()).toEqual([A, B, C].sort());
    expect(ui.button(en['list.search.clear']).disabled).toBe(true);

    await ui.type('bet');
    await ui.click(ui.button(en['list.reset']));
    expect(ui.q<HTMLInputElement>('input[type="search"]').value).toBe('');
    expect(ui.rows()).toHaveLength(3);

    const empty = await open(await loaded([]));
    expect(empty.el.textContent).toContain(en['list.empty']);
    expect(empty.el.querySelector('input[type="search"]')).toBeNull();
  });

  it('filters by status chips and tag chips with any-of matching and shows context apart from matches', async () => {
    const ui = await open(await loaded(beans()));
    await ui.click(ui.button('api 2'));
    // B and C match; A is only B's parent, so it is context: drawn, marked, not counted.
    expect(ui.rows()).toEqual([`${A}*`, B, C]);
    expect(ui.el.textContent).toContain('2 matches of 3');
    expect(ui.q(`[data-id="${A}"]`).closest('li')?.classList.contains('context')).toBe(true);
    expect(ui.q(`[data-id="${A}"]`).closest('li')?.querySelector('input[type="checkbox"]')).toBeNull();
    expect(ui.button('api 2').getAttribute('aria-pressed')).toBe('true');

    await ui.click(ui.button('ui 2'));
    expect(ui.rows()).toEqual([A, B, C]);

    await ui.click(ui.button('todo'));
    expect(ui.state.getSnapshot().filters.statuses).toEqual(['todo']);
  });

  it('opens the search with / and the tag filter with g t outside text fields, and Escape clears the search', async () => {
    const ui = await open(await loaded(beans()));
    const key = (target: HTMLElement, name: string): void => { target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })); };

    key(ui.q(`[data-id="${A}"]`), '/');
    expect(document.activeElement).toBe(ui.q('input[type="search"]'));

    await ui.type('al');
    key(ui.q('input[type="search"]'), '/');
    expect(ui.q<HTMLInputElement>('input[type="search"]').value).toBe('al');
    key(ui.q('input[type="search"]'), 'Escape');
    await tick();
    expect(ui.state.getSnapshot().filters.search).toBe('');

    key(ui.q(`[data-id="${A}"]`), 'g');
    key(ui.q(`[data-id="${A}"]`), 't');
    await tick();
    expect(ui.q<HTMLDetailsElement>('details.filters').open).toBe(true);
  });
});

describe('sorting and columns', () => {
  it('sorts, hides and shows columns, and saves both with the layout', async () => {
    const ui = await open(await loaded(beans()));
    const sort = ui.q<HTMLSelectElement>('.line select');
    sort.value = 'title';
    sort.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    await ui.click(ui.button(en['list.sort.descending']));
    expect(ui.rows()).toEqual([C, B, A]);
    expect(ui.saved.at(-1)?.sort).toEqual({ key: 'title', descending: true });

    expect(ui.el.querySelector('.id')).not.toBeNull();
    const id = [...ui.el.querySelectorAll<HTMLInputElement>('.columns input')][0];
    if (!id) throw new Error('no column checkbox');
    id.checked = false;
    id.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(ui.el.querySelector('.row .id')).toBeNull();
    expect(ui.saved.at(-1)?.columns).toEqual(['status', 'type', 'priority']);
  });
});

describe('inline fields', () => {
  it('shows the intended value as pending, keeps it only after Beans confirms, and refreshes consumers', async () => {
    const made = await loaded(beans());
    const ui = await open(made);
    const picker = (): HTMLSelectElement => ui.q<HTMLSelectElement>(`select[aria-label="Status of ${B}"]`);
    picker().value = 'in-progress';
    picker().dispatchEvent(new Event('change', { bubbles: true }));
    await tick();

    expect(picker().value).toBe('in-progress');
    expect(picker().disabled).toBe(true);
    expect(ui.el.textContent).toContain(en['row.saving']);
    expect(made.port.mutations[0]?.args).toEqual([B, `rev-${B}`, { kind: 'fields', status: 'in-progress' }]);

    made.port.mutations[0]?.settle({ ok: true, value: detail(B, { status: 'in-progress' }) });
    await vi.waitFor(() => { expect(made.state.getSnapshot().saves.size).toBe(0); });
    await tick();
    expect(picker().value).toBe('in-progress');
    expect(picker().disabled).toBe(false);
  });

  it('puts the old value back when the save fails, and offers a deliberate retry after a conflict', async () => {
    const made = await loaded(beans());
    const ui = await open(made);
    const picker = (): HTMLSelectElement => ui.q<HTMLSelectElement>(`select[aria-label="Priority of ${B}"]`);
    picker().value = 'high';
    picker().dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    made.port.mutations[0]?.settle({ ok: false, error: { kind: 'validation', code: 'backend', message: 'nope' } });
    await vi.waitFor(() => { expect(made.state.getSnapshot().saves.get(B)?.kind).toBe('failed'); });
    await tick();
    expect(picker().value).toBe('normal');
    expect(ui.el.textContent).toContain('nope');
    await ui.click(ui.el.querySelector<HTMLElement>('.feedback button') ?? ui.button(en['action.dismiss']));
    expect(made.state.getSnapshot().saves.size).toBe(0);

    picker().value = 'low';
    picker().dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    made.port.mutations[1]?.settle({ ok: false, error: { kind: 'conflict', code: 'revision', current: detail(B, { revision: 'rev-new', priority: 'critical' }) } });
    await vi.waitFor(() => { expect(made.state.getSnapshot().saves.get(B)?.kind).toBe('conflict'); });
    await tick();
    expect(ui.el.textContent).toContain(en['row.conflict']);

    await ui.click(ui.button(en['row.applyAgain']));
    expect(made.port.mutations[2]?.args).toEqual([B, 'rev-new', { kind: 'fields', priority: 'low' }]);
  });

  it('does not offer to edit a bean whose file has problems', async () => {
    const ui = await open(await loaded([bean(A, { problems: ['invalid-file'] }), bean(B)]));
    expect(ui.q<HTMLSelectElement>(`select[aria-label="Status of ${A}"]`).disabled).toBe(true);
    expect(ui.q<HTMLSelectElement>(`select[aria-label="Status of ${B}"]`).disabled).toBe(false);
  });
});

describe('selection and copying', () => {
  it('keeps hidden selections, shows the target count, and copies full IDs of the selection or the current bean', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const ui = await open(await loaded(beans()));

    await ui.click(ui.q(`input[aria-label="Select ${A}"]`));
    await ui.click(ui.q(`input[aria-label="Select ${C}"]`));
    await ui.type('beta');
    expect(ui.el.textContent).toContain('2 beans selected');
    // Alpha is selected and drawn as context, but it is not a match, so it counts as hidden with Gamma.
    expect(ui.el.textContent).toContain('2 hidden by filters');

    await ui.click(ui.button(en['copy.selected']));
    await tick();
    expect(writeText).toHaveBeenLastCalledWith(`${A}\n${C}`);
    expect(ui.el.textContent).toContain('Copied 2 IDs.');

    // Select all matches takes the matches only, never context rows, and replaces the hidden ones.
    await ui.click(ui.button(en['selection.all']));
    expect(ui.state.getSnapshot().selection.ids).toEqual([B]);
    await ui.click(ui.button(en['selection.clear']));
    expect(ui.button(en['copy.selected']).disabled).toBe(true);

    expect(ui.button(en['copy.current']).disabled).toBe(true);
    await ui.click(ui.q(`[data-id="${B}"]`));
    await ui.click(ui.button(en['copy.current']));
    expect(writeText).toHaveBeenLastCalledWith(B);
  });

  it('selects and advances with Space, moves with j and k, copies with y and clears with Escape', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const ui = await open(await loaded(beans()));
    const key = async (name: string): Promise<void> => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
      await tick();
    };
    ui.q(`[data-id="${A}"]`).focus();
    await key(' ');
    expect(document.activeElement).toBe(ui.q(`[data-id="${B}"]`));
    await key('j');
    await key('k');
    await key(' ');
    expect(ui.state.getSnapshot().selection.ids).toEqual([A, B]);

    await key('y');
    expect(writeText).toHaveBeenLastCalledWith(`${A}\n${B}`);
    await key('Escape');
    expect(ui.state.getSnapshot().selection.ids).toEqual([]);
  });
});

describe('refreshing', () => {
  it('keeps focus and rows in place while data refreshes', async () => {
    const made = harness();
    const started = made.state.start();
    made.port.lastList.settle({ ok: true, value: read(beans()) });
    await started;
    const ui = await open(made);
    const row = ui.q(`[data-id="${B}"]`);
    row.focus();

    void made.state.refresh();
    made.port.lastList.settle({ ok: true, value: read(beans().map((one) => (one.id === C ? { ...one, title: 'Gamma 2' } : one))) });
    await vi.waitFor(() => { expect(ui.el.textContent).toContain('Gamma 2'); });
    expect(ui.q(`[data-id="${B}"]`)).toBe(row);
    expect(document.activeElement).toBe(row);
  });
});
