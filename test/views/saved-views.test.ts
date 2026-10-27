// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadViews, type ViewEntry } from '../../src/state/saved-views.ts';
import { DEFAULT_LAYOUT } from '../../src/views/layout.ts';
import { en } from '../../src/views/messages.en.ts';
import { A, B, C, bean, loaded } from '../state/support.ts';
import { open, settle } from './ui.ts';

const data = () => [
  bean(A, { title: 'Alpha', type: 'epic', childIds: [B], tags: ['ui'] }),
  bean(B, { title: 'Beta', parentId: A, tags: ['api'], priority: 'high' }),
  bean(C, { title: 'Gamma', tags: ['api', 'ui'], priority: 'high' }),
];
const stored = (id: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, name, search: '', statuses: [], types: [], priorities: [], tags: [], readiness: 'any', representation: 'list', sort: { key: 'default', descending: false }, swimlanes: 'none', ...extra,
});
const entries = (...raw: unknown[]): readonly ViewEntry[] => loadViews({ savedViews: raw }).entries;

async function workspace(views: readonly ViewEntry[] = [], layout = DEFAULT_LAYOUT) {
  const made = await loaded(data(), { readyIds: [B, C] });
  const ui = await open(made, views, layout);
  const nav = (label: string): HTMLButtonElement => ui.buttonIn('nav', label);
  const click = async (button: HTMLButtonElement): Promise<void> => { button.click(); await settle(); };
  const rows = (): string[] => [...ui.el.querySelectorAll<HTMLElement>('button.row')].map((row) => `${row.dataset.id ?? ''}${row.dataset.context === undefined ? '' : '*'}`);
  const current = (): string => ui.el.querySelector('nav [aria-current="page"]')?.textContent.trim() ?? '';
  return { ...ui, made, nav, click, rows, current };
}

describe('saving and applying views', () => {
  it('saves the combined filters and presentation, then applies them across list, board and hierarchy', async () => {
    const ui = await workspace();
    await ui.click(ui.nav(en['nav.ready']));
    await ui.click(ui.buttonIn('.controls', 'api 2'));
    await ui.click(ui.buttonIn('.controls', en['view.board']));
    await ui.text(ui.q<HTMLInputElement>('nav input[type="text"]'), ' Ready api ');
    await ui.click(ui.buttonIn('nav', en['saved.save']));

    expect(ui.host.savedViews).toHaveLength(1);
    expect(ui.host.savedViews[0]).toMatchObject({ kind: 'view', view: { name: 'Ready api', readiness: 'ready', tags: ['api'], representation: 'board' } });
    expect(ui.current()).toBe('Ready api');

    await ui.click(ui.nav(en['nav.all']));
    await ui.click(ui.buttonIn('.controls', en['view.list']));
    expect(ui.state.getSnapshot().filters).toMatchObject({ readiness: 'any', tags: [] });

    await ui.click(ui.nav('Ready api'));
    expect(ui.state.getSnapshot().filters).toMatchObject({ readiness: 'ready', tags: ['api'] });
    expect(ui.state.getSnapshot().visible.map((one) => one.id)).toEqual([B, C]);
    expect(ui.el.querySelector('.board')).not.toBeNull();

    // The same filters hold in every representation.
    for (const view of [en['view.hierarchy'], en['view.list'], en['view.board']]) {
      await ui.click(ui.buttonIn('.controls', view));
      expect(ui.state.getSnapshot().visible.map((one) => one.id)).toEqual([B, C]);
    }
    expect(ui.made.port.mutations).toHaveLength(0);
  });

  it('applies the stored representation, sort and swimlanes, and drops ad-hoc filter edits when applied again', async () => {
    const view = stored('v', 'Hier', { representation: 'hierarchy', sort: { key: 'title', descending: true }, priorities: ['high'] });
    const ui = await workspace(entries(view));

    await ui.click(ui.nav('Hier'));
    expect(ui.state.getSnapshot().visible.map((one) => one.id)).toEqual([B, C]);
    expect(ui.q('.controls').textContent).toContain(en['sort.title']);
    expect(ui.buttonIn('.controls', en['view.hierarchy']).getAttribute('aria-pressed')).toBe('true');

    await ui.click(ui.buttonIn('.controls', 'api 2'));
    ui.state.setFilters({ priorities: [] });
    await ui.click(ui.nav('Hier'));
    expect(ui.state.getSnapshot().filters.priorities).toEqual(['high']);
    expect(ui.state.getSnapshot().filters.tags).toEqual([]);
  });

  it('starts from the saved view stored in the layout, and shows an unmatched stored value', async () => {
    const old = stored('v', 'Old', { statuses: ['archived'], tags: ['gone', 'api'] });
    const ui = await workspace(entries(old), { ...DEFAULT_LAYOUT, savedView: 'v' });

    expect(ui.current()).toBe('Old');
    expect(ui.state.getSnapshot().filters.statuses).toEqual(['archived']);
    expect(ui.el.textContent).toContain(en['list.noMatches']);
    expect(ui.q('nav').textContent).toContain('status:archived, tag:gone');
  });

  it('updates a view with the filters on screen, keeping its name', async () => {
    const ui = await workspace(entries(stored('v', 'Mine')));
    await ui.click(ui.nav('Mine'));
    await ui.click(ui.buttonIn('.controls', 'ui 2'));
    await ui.click(ui.buttonIn('nav', en['saved.update']));

    expect(ui.host.savedViews[0]).toMatchObject({ view: { name: 'Mine', tags: ['ui'] } });
  });

  it('renames a view, refuses a taken name with a visible error, and keeps the filters you are editing', async () => {
    const ui = await workspace(entries(stored('a', 'Alpha'), stored('b', 'Beta')));
    await ui.click(ui.nav('Beta'));
    await ui.click(ui.buttonIn('.controls', 'ui 2'));

    await ui.click(ui.buttonIn('nav', en['saved.rename']));
    await ui.text(ui.q<HTMLInputElement>('nav form input'), 'alpha');
    await ui.click(ui.buttonIn('nav', en['saved.rename']));
    expect(ui.q('nav [role="alert"]').textContent).toBe(en['saved.error.name-taken']);

    await ui.text(ui.q<HTMLInputElement>('nav form input'), 'Gamma view');
    await ui.click(ui.buttonIn('nav', en['saved.rename']));
    expect(ui.current()).toBe('Gamma view');
    expect(ui.state.getSnapshot().filters.tags).toEqual(['ui']);
    expect(ui.q('nav').textContent).not.toContain('Beta');
  });

  it('asks before removing, removes only the plugin entry, and falls back to the built-in entry', async () => {
    const ui = await workspace(entries(stored('a', 'Alpha', { tags: ['ui'] })));
    await ui.click(ui.nav('Alpha'));
    await ui.click(ui.buttonIn('nav', en['saved.remove']));
    expect(ui.host.savedViews).toHaveLength(1);
    expect(ui.q('nav').textContent).toContain('Remove Alpha?');

    await ui.click(ui.buttonIn('nav', en['action.cancel']));
    expect(ui.host.savedViews).toHaveLength(1);
    await ui.click(ui.buttonIn('nav', en['saved.remove']));
    await ui.click(ui.buttonIn('nav', en['saved.remove']));

    expect(ui.host.savedViews).toHaveLength(0);
    expect(ui.q('nav').textContent).toContain(en['saved.none']);
    expect(ui.current()).toBe(en['nav.all']);
    expect(ui.made.port.mutations).toHaveLength(0);
  });

  it('reports a failed write and an empty name instead of pretending it saved', async () => {
    const ui = await workspace();
    await ui.click(ui.buttonIn('nav', en['saved.save']));
    expect(ui.q('nav [role="alert"]').textContent).toBe(en['saved.error.name-empty']);

    ui.host.views.failStorage = true;
    await ui.text(ui.q<HTMLInputElement>('nav input[type="text"]'), 'Doomed');
    await ui.click(ui.buttonIn('nav', en['saved.save']));
    expect(ui.q('nav [role="alert"]').textContent).toBe(en['saved.error.storage']);
    expect(ui.host.savedViews).toHaveLength(0);
  });
});

describe('missing and invalid views', () => {
  it('reports a saved view that no longer exists, shows all work and recovers on dismiss', async () => {
    const ui = await workspace(entries(stored('a', 'Alpha')), { ...DEFAULT_LAYOUT, savedView: 'gone' });

    expect(ui.q('.banner').textContent).toContain(en['saved.missing']);
    expect(ui.current()).toBe(en['nav.all']);
    expect(ui.rows()).toHaveLength(3);

    await ui.click(ui.buttonIn('.banner', en['action.dismiss']));
    expect(ui.el.querySelector('.banner')).toBeNull();
  });

  it('lists an invalid entry with its reason next to valid ones and lets the user remove it', async () => {
    const ui = await workspace(entries(stored('a', 'Alpha'), stored('x', 'Broken', { readiness: 'soon' })));

    expect(ui.q('nav').textContent).toContain(en['saved.invalid.readiness']);
    await ui.click(ui.nav('Alpha'));
    expect(ui.state.getSnapshot().status).toBe('ready');

    await ui.click(ui.buttonIn('nav li.invalid', en['saved.remove']));
    await ui.click(ui.buttonIn('nav li.invalid', en['saved.remove']));
    expect(ui.host.savedViews.map((entry) => entry.kind)).toEqual(['view']);
  });
});
