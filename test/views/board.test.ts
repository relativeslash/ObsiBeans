// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { A, B, C, bean, detail, loaded } from '../state/support.ts';
import { open, settle } from './ui.ts';

const data = () => [
  bean(A, { title: 'Alpha', type: 'epic', status: 'in-progress' }),
  bean(B, { title: 'Beta', parentId: A, status: 'todo' }),
  bean(C, { title: 'Gamma', status: 'draft' }),
];

async function board(extra: { swimlanes?: boolean } = {}) {
  const made = await loaded(data());
  const ui = await open(made);
  ui.buttonIn('.controls', 'Board').click();
  await settle();
  if (extra.swimlanes) {
    ui.q<HTMLInputElement>('.controls .line:first-child input').click();
    await settle();
  }
  const cell = (id: string): string => ui.q(`.card:has([data-id="${id}"])`).closest('.cell')?.getAttribute('aria-label') ?? '';
  const move = async (id: string, status: string): Promise<void> => { await ui.choose(ui.q<HTMLSelectElement>(`select[aria-label="Move ${id} to status"]`), status); };
  const drag = (type: string, target: Element): void => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { setData: () => undefined, effectAllowed: '', dropEffect: ''} });
    target.dispatchEvent(event);
  };
  return { ...ui, made, cell, move, drag };
}

describe('status board', () => {
  it('draws the five statuses with filtered counts and keeps the selected bean and filters across views', async () => {
    const ui = await board();
    expect([...ui.el.querySelectorAll('.head')].map((one) => one.textContent.replace(/\s+/g, ' ').trim())).toEqual(['draft 1', 'todo 1', 'in-progress 1', 'completed 0', 'scrapped 0']);
    expect(ui.cell(B)).toBe('todo, 1 bean');

    ui.made.state.setFilters({ search: 'beta' });
    await settle();
    expect([...ui.el.querySelectorAll('.head')].map((one) => one.textContent.replace(/\s+/g, ' ').trim())).toEqual(['draft 0', 'todo 1', 'in-progress 0', 'completed 0', 'scrapped 0']);
    expect(ui.el.querySelectorAll('.card')).toHaveLength(1);

    ui.q<HTMLElement>(`button.row[data-id="${B}"]`).click();
    await settle();
    ui.buttonIn('.controls', 'List').click();
    await settle();
    expect(ui.made.state.getSnapshot().selectedId).toBe(B);
    expect(ui.made.state.getSnapshot().filters.search).toBe('beta');
    expect(ui.q('button.row[aria-current="true"]').getAttribute('data-id')).toBe(B);
  });

  it('moves a card with the Move action through the shared mutation, and only after Beans confirms', async () => {
    const ui = await board();
    await ui.move(B, 'in-progress');

    expect(ui.made.port.mutations[0]?.args).toEqual([B, `rev-${B}`, { kind: 'fields', status: 'in-progress' }]);
    expect(ui.cell(B)).toBe('todo, 1 bean');
    expect(ui.q<HTMLSelectElement>(`select[aria-label="Move ${B} to status"]`).value).toBe('in-progress');
    expect(ui.q<HTMLSelectElement>(`select[aria-label="Move ${B} to status"]`).disabled).toBe(true);

    ui.made.port.mutations[0]?.settle({ ok: true, value: detail(B, { status: 'in-progress', parentId: A }) });
    await settle();
    ui.made.port.lastList.settle({ ok: true, value: { beans: [bean(A, { status: 'in-progress' }), bean(B, { status: 'in-progress', parentId: A }), bean(C, { status: 'draft' })], invalid: [], blockedIds: [], readyIds: [] } });
    await settle();
    expect(ui.cell(B)).toBe('in-progress, 2 beans');
  });

  it('restores the card and says why when the move fails, and offers to apply again after a conflict', async () => {
    const ui = await board();
    await ui.move(B, 'completed');
    ui.made.port.mutations[0]?.settle({ ok: false, error: { kind: 'validation', code: 'backend', message: 'nope' } });
    await settle();
    expect(ui.cell(B)).toBe('todo, 1 bean');
    expect(ui.q<HTMLSelectElement>(`select[aria-label="Move ${B} to status"]`).value).toBe('todo');
    expect(ui.q('[role="alert"]').textContent).toContain('nope');

    ui.buttonIn(`.card:has([data-id="${B}"])`, 'Dismiss').click();
    await settle();
    await ui.move(B, 'scrapped');
    ui.made.port.mutations[1]?.settle({ ok: false, error: { kind: 'conflict', code: 'revision', current: detail(B, { revision: 'rev-new', priority: 'high' }) } });
    await settle();
    expect(ui.cell(B)).toBe('todo, 1 bean');
    ui.buttonIn(`.card:has([data-id="${B}"])`, 'Apply my change again').click();
    await settle();
    expect(ui.made.port.mutations[2]?.args).toEqual([B, 'rev-new', { kind: 'fields', status: 'scrapped' }]);
  });

  it('moves by drag between columns, ignores a drop on the same column, and a cancelled drag changes nothing', async () => {
    const ui = await board();
    const card = ui.q(`.card:has([data-id="${B}"])`);
    const todo = card.closest('.cell');
    const done = ui.el.querySelectorAll('.cells')[0]?.children[3];
    if (!todo || !done) throw new Error('no cells');

    ui.drag('dragstart', card);
    await settle();
    ui.drag('drop', todo);
    await settle();
    expect(ui.made.port.mutations).toHaveLength(0);

    ui.drag('dragend', card);
    ui.drag('drop', done);
    await settle();
    expect(ui.made.port.mutations).toHaveLength(0);

    ui.drag('dragstart', card);
    await settle();
    ui.drag('drop', done);
    await settle();
    expect(ui.made.port.mutations[0]?.args).toEqual([B, `rev-${B}`, { kind: 'fields', status: 'completed' }]);
  });

  it('locks a card while its save is pending', async () => {
    const ui = await board();
    await ui.move(B, 'completed');
    expect(ui.q(`.card:has([data-id="${B}"])`).getAttribute('draggable')).toBe('false');
  });
});

describe('board swimlanes', () => {
  it('groups by direct parent plus No parent, with headers that are not selectable', async () => {
    const ui = await board({ swimlanes: true });
    const lanes = [...ui.el.querySelectorAll('.lane')];
    expect(lanes.map((lane) => lane.querySelector('h3')?.textContent)).toEqual([`Alpha (${A})`, 'No parent']);
    expect(ui.el.querySelectorAll('h3 input, h3 button')).toHaveLength(0);

    ui.q<HTMLInputElement>(`input[aria-label="Select ${B}"]`).click();
    await settle();
    expect(ui.made.state.getSnapshot().selection.ids).toEqual([B]);
  });

  it('rejects a drop into another lane and never changes a parent', async () => {
    const ui = await board({ swimlanes: true });
    const card = ui.q(`.card:has([data-id="${B}"])`); // lane Alpha
    const other = ui.el.querySelectorAll('.lane')[1]?.querySelector('.cells')?.children[2]; // No parent lane, in-progress
    if (!other) throw new Error('no cell');
    ui.drag('dragstart', card);
    await settle();
    ui.drag('drop', other);
    await settle();
    expect(ui.made.port.mutations).toHaveLength(0);
  });
});
