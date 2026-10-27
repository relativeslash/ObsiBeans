// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseLayout } from '../../src/views/layout.ts';
import { en } from '../../src/views/messages.en.ts';
import { A, B, C, bean, detail, loaded } from '../state/support.ts';
import { open, settle } from './ui.ts';

const D = 'FX-ddddd';
const E = 'FX-eeeee';
const F = 'FX-fffff';
const G = 'FX-ggggg';
const H = 'FX-hhhhh';

/** Milestone A > epic B > tasks C (completed), D (scrapped), E; empty milestone F; task G under a missing parent. */
const data = () => [
  bean(A, { title: 'Alpha', type: 'milestone' }),
  bean(B, { title: 'Beta', type: 'epic', parentId: A, childIds: [C, D, E] }),
  bean(C, { title: 'Gamma', parentId: B, status: 'completed' }),
  bean(D, { title: 'Delta', parentId: B, status: 'scrapped' }),
  bean(E, { title: 'Epsilon', parentId: B, blockedByIds: [G] }),
  bean(F, { title: 'Zeta', type: 'milestone' }),
  bean(G, { title: 'Eta', parentId: 'FX-zzzzz' }),
];

async function hierarchy(beans = data()) {
  const made = await loaded(beans);
  const ui = await open(made);
  ui.buttonIn('.controls', 'Hierarchy').click();
  await settle();
  const rows = (): string[] => [...ui.el.querySelectorAll('.rows button.row')].map((one) => one.getAttribute('data-id') ?? '');
  const row = (id: string): HTMLElement => ui.q(`button.row[data-id="${id}"]`);
  const item = (id: string): HTMLElement => row(id).closest('li') ?? ui.el;
  const twisty = (id: string): HTMLButtonElement => ui.q<HTMLButtonElement>(`li:has([data-id="${id}"]) button.twisty`);
  const click = async (target: HTMLElement): Promise<void> => { target.click(); await settle(); };
  return { ...ui, made, rows, row, item, twisty, click };
}

describe('hierarchy view', () => {
  it('starts with the roots closed, opens a parent with its twisty and shows the progress of each parent', async () => {
    const ui = await hierarchy();
    expect(ui.rows()).toEqual([A, F, G]);
    expect(ui.twisty(A).getAttribute('aria-expanded')).toBe('false');
    expect(ui.twisty(A).getAttribute('aria-label')).toBe(`Expand ${A}`);

    await ui.click(ui.twisty(A));
    expect(ui.rows()).toEqual([A, B, F, G]);
    expect(ui.twisty(A).getAttribute('aria-expanded')).toBe('true');
    await ui.click(ui.twisty(B));
    expect(ui.rows()).toEqual([A, B, E, C, D, F, G]);

    // Progress is completed over non-scrapped leaves, completed and scrapped shown apart, parents not counted.
    expect(ui.item(B).querySelector('.progress')?.textContent).toBe('50% complete: 1 completed, 1 scrapped, 1 open');
    expect(ui.item(A).querySelector('.progress')?.textContent).toBe('50% complete: 1 completed, 1 scrapped, 1 open');
    expect(ui.item(F).querySelector('.progress')?.textContent).toBe(en['hierarchy.none']);
    expect(ui.item(C).querySelector('.progress')).toBeNull();
    expect(ui.el.querySelector('.rule')?.textContent).toBe(en['hierarchy.rule']);
  });

  it('expands and collapses everything, and remembers the choice when the view is switched away and back', async () => {
    const ui = await hierarchy();
    await ui.click(ui.buttonIn('.bar', en['hierarchy.expandAll']));
    expect(ui.rows()).toEqual([A, B, E, C, D, F, G]);

    ui.buttonIn('.controls', 'List').click();
    await settle();
    ui.buttonIn('.controls', 'Hierarchy').click();
    await settle();
    expect(ui.rows()).toEqual([A, B, E, C, D, F, G]);

    await ui.click(ui.buttonIn('.bar', en['hierarchy.collapseAll']));
    expect(ui.rows()).toEqual([A, F, G]);
  });

  it('moves with the arrow keys like a tree: Right opens then enters, Left closes then returns to the parent', async () => {
    const ui = await hierarchy();
    ui.row(A).focus();

    ui.key(ui.row(A), 'ArrowRight');
    await settle();
    expect(ui.rows()).toEqual([A, B, F, G]);
    ui.key(ui.row(A), 'ArrowRight');
    await settle();
    expect(document.activeElement).toBe(ui.row(B));

    ui.key(ui.row(B), 'ArrowRight');
    await settle();
    ui.key(ui.row(B), 'ArrowRight');
    await settle();
    expect(document.activeElement).toBe(ui.row(E));
    // A leaf has nothing to open; Left goes to its parent, and again closes nothing it does not own.
    ui.key(ui.row(E), 'ArrowRight');
    ui.key(ui.row(E), 'ArrowLeft');
    await settle();
    expect(document.activeElement).toBe(ui.row(B));
    ui.key(ui.row(B), 'ArrowLeft');
    await settle();
    expect(ui.rows()).toEqual([A, B, F, G]);
    expect(document.activeElement).toBe(ui.row(B));
    ui.key(ui.row(B), 'ArrowLeft');
    await settle();
    expect(document.activeElement).toBe(ui.row(A));

    // j and the arrow keys of the list still step through the visible rows; Space selects and advances.
    ui.key(ui.row(A), 'j');
    await settle();
    expect(document.activeElement).toBe(ui.row(B));
  });

  it('keeps the tree and its context under filters: matches open their path, context rows are not matches or selectable', async () => {
    const ui = await hierarchy();
    ui.made.state.setFilters({ search: 'gamma' });
    await settle();

    expect(ui.rows()).toEqual([A, B, C]);
    expect(ui.item(A).classList.contains('context')).toBe(true);
    expect(ui.item(B).classList.contains('context')).toBe(true);
    expect(ui.item(C).classList.contains('context')).toBe(false);
    expect(ui.item(A).querySelector('input[type="checkbox"]')).toBeNull();
    expect(ui.item(C).querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(ui.q('.matches').textContent).toContain('1 match');

    ui.made.state.selectVisible();
    await settle();
    expect(ui.made.state.getSnapshot().selection.ids).toEqual([C]);

    // Collapsing context keeps the filters and the match; the selected bean stays the same through a view switch.
    await ui.click(ui.twisty(B));
    expect(ui.rows()).toEqual([A, B]);
    expect(ui.made.state.getSnapshot().visible.map((one) => one.id)).toEqual([C]);
    await ui.click(ui.twisty(B));
    await ui.click(ui.row(C));
    ui.buttonIn('.controls', 'List').click();
    await settle();
    expect(ui.made.state.getSnapshot().selectedId).toBe(C);
    expect(ui.made.state.getSnapshot().filters.search).toBe('gamma');
  });

  it('keeps open parents by full ID when a refresh reorders or changes the beans', async () => {
    const ui = await hierarchy();
    await ui.click(ui.twisty(A));
    expect(ui.rows()).toEqual([A, B, F, G]);

    const next = data().reverse();
    void ui.made.state.refresh();
    ui.made.port.lastList.settle({ ok: true, value: { beans: next, invalid: [], blockedIds: [], readyIds: [] } });
    await settle();
    expect(ui.rows()).toEqual([A, B, F, G]);
  });

  it('flags a missing parent with its ID, draws the bean at the top and shows open blockers', async () => {
    const ui = await hierarchy();
    expect(ui.item(G).querySelector('[role="alert"]')?.textContent).toBe(en['hierarchy.missingParent'].replace('{id}', 'FX-zzzzz'));
    await ui.click(ui.twisty(A));
    await ui.click(ui.twisty(B));
    expect(ui.item(E).querySelector('.warn')?.textContent).toBe(`Blocked by ${G}`);
    // The invalid reference is acted on through the inspector's parent editor, which is one click away.
    await ui.click(ui.row(G));
    expect(ui.q('.pane-detail').textContent).toContain(G);
  });

  it('shows a parent loop and a blocking loop as invalid data, and draws each bean once', async () => {
    const ui = await hierarchy([
      bean(A, { title: 'Alpha', type: 'epic', parentId: B }),
      bean(B, { title: 'Beta', type: 'epic', parentId: A }),
      bean(C, { title: 'Gamma', blockingIds: [D], blockedByIds: [D] }),
      bean(D, { title: 'Delta' }),
    ]);

    expect(ui.rows().filter((id) => id === A || id === B)).toHaveLength(1);
    expect(ui.item(A).querySelector('[role="alert"]')?.textContent).toBe(en['hierarchy.parentLoop']);
    expect(ui.item(C).querySelector('.warn')?.textContent).toContain(en['hierarchy.blockedLoop']);
    expect(ui.item(D).querySelector('.warn')?.textContent).toContain(en['hierarchy.blockedLoop']);
  });

  it('creates a child from a row, with the parent filled in, and only for types that can have children', async () => {
    const ui = await hierarchy();
    expect(ui.item(G).querySelector('.child')).toBeNull();

    await ui.click(ui.buttonIn(`li:has([data-id="${F}"])`, en['children.new']));
    expect(ui.q('.create').textContent).toContain(en['create.parent'].replace('{id}', F));
    await ui.text(ui.q<HTMLInputElement>('#create-title'), 'Child');
    await ui.press(en['create.submit']);
    expect(ui.port.creations[0]?.args).toEqual([{ title: 'Child', parentId: F }]);

    ui.port.creations[0]?.settle({ ok: true, value: detail(H, { title: 'Child', parentId: F }) });
    await settle();
    ui.port.lastList.settle({ ok: true, value: { beans: [...data(), bean(H, { title: 'Child', parentId: F })], invalid: [], blockedIds: [], readyIds: [] } });
    await settle();
    // The new child makes F a parent: it has a twisty and a progress from the authoritative reload.
    expect(ui.twisty(F)).toBeTruthy();
    expect(ui.item(F).querySelector('.progress')?.textContent).toBe('0% complete: 0 completed, 0 scrapped, 1 open');
  });

  it('updates the tree and the progress from backend state after a parent change', async () => {
    const ui = await hierarchy();
    await ui.click(ui.twisty(A));
    await ui.click(ui.twisty(B));

    const saved = ui.made.state.mutate(E, { kind: 'parent', parentId: F });
    ui.port.mutations[0]?.settle({ ok: true, value: detail(E, { parentId: F }) });
    await saved;
    await settle();
    ui.port.lastList.settle({
      ok: true,
      value: { beans: data().map((one) => (one.id === E ? { ...one, parentId: F } : one)), invalid: [], blockedIds: [], readyIds: [] },
    });
    await settle();

    // E left B, so B has one completed and one scrapped leaf and F holds the open one.
    expect(ui.item(B).querySelector('.progress')?.textContent).toBe('100% complete: 1 completed, 1 scrapped, 0 open');
    expect(ui.item(F).querySelector('.progress')?.textContent).toBe('0% complete: 0 completed, 0 scrapped, 1 open');
    expect(ui.rows()).toEqual([A, B, C, D, F, G]);
  });

  it('says "All scrapped" instead of a percentage when every leaf is scrapped', async () => {
    const ui = await hierarchy([bean(A, { type: 'epic' }), bean(B, { parentId: A, status: 'scrapped' })]);
    expect(ui.item(A).querySelector('.progress')?.textContent).toBe('All scrapped (1)');
  });
});

describe('layout', () => {
  it('saves the hierarchy view and falls back to the list for an unknown one', () => {
    expect(parseLayout({ view: 'hierarchy' }).view).toBe('hierarchy');
    expect(parseLayout({ view: 'timeline' }).view).toBe('list');
    expect(parseLayout({ view: 'board' }).view).toBe('board');
  });
});
