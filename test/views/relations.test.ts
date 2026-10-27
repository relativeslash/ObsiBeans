// @vitest-environment jsdom
import { mount } from 'svelte';
import { describe, expect, it } from 'vitest';
import IssueTab from '../../src/views/IssueTab.svelte';
import { en } from '../../src/views/messages.en.ts';
import { bean, detail, loaded } from '../state/support.ts';
import { conflict, mounts, open, rejected, settle, TestHost } from './ui.ts';

const M = 'FX-mmmmm';
const E = 'FX-eeeee';
const T = 'FX-ttttt';
const U = 'FX-uuuuu';
const K = 'FX-kkkkk';

/** milestone M > epic E > task T; a loose task U and a loose feature K. */
const tree = () => [
  bean(M, { type: 'milestone', title: 'Milestone', childIds: [E] }),
  bean(E, { type: 'epic', title: 'Epic', parentId: M, childIds: [T] }),
  bean(T, { type: 'task', title: 'Task', parentId: E }),
  bean(U, { type: 'task', title: 'Loose task' }),
  bean(K, { type: 'feature', title: 'Feature' }),
];

async function shown(id: string, beans = tree()) {
  const ui = await open(await loaded(beans));
  await ui.show(id);
  const pick = async (scope: string, id2: string): Promise<void> => {
    const found = [...ui.q(scope).querySelectorAll<HTMLButtonElement>('.picker li button')].find((one) => one.textContent.includes(id2));
    if (!found) throw new Error(`${id2} is not offered in ${scope}`);
    found.click();
    await settle();
  };
  const offered = (): string[] => [...ui.el.querySelectorAll('.picker li button')].map((one) => one.textContent.replace(/\s+/g, ' ').trim());
  const section = (heading: string): HTMLElement => {
    const found = [...ui.el.querySelectorAll<HTMLElement>('.inspector section')].find((one) => one.querySelector('h3')?.textContent === heading);
    if (!found) throw new Error(`No section ${heading}`);
    return found;
  };
  const inSection = (heading: string, label: string): HTMLButtonElement => {
    const found = [...section(heading).querySelectorAll('button')].find((one) => one.textContent.trim() === label);
    if (!found) throw new Error(`No button ${label} in ${heading}`);
    return found;
  };
  const click = async (button: HTMLElement): Promise<void> => { button.click(); await settle(); };
  return { ui, pick, offered, section, inSection, click };
}

describe('parent editor', () => {
  it('shows the chain from the root with links, and opening an ancestor keeps a way back', async () => {
    const { ui, click, section } = await shown(T);

    expect(section(en['inspector.parent']).querySelector('nav li:last-child')?.textContent).toBe('Task');
    expect([...section(en['inspector.parent']).querySelectorAll('nav .link')].map((one) => one.textContent.replace(/\s+/g, ' ').trim())).toEqual([`${M} Milestone`, `${E} Epic`]);

    await click(section(en['inspector.parent']).querySelectorAll<HTMLElement>('nav .link')[1] ?? ui.el);
    expect(ui.q('.inspector h2').textContent).toBe('Epic');
    await ui.press(en['action.back']);
    expect(ui.q('.inspector h2').textContent).toBe('Task');
  });

  it('offers only eligible parents, marks the current one and sets the chosen one', async () => {
    const { ui, offered, pick, click, inSection } = await shown(T);

    await click(inSection(en['inspector.parent'], en['parent.change']));
    expect(offered()).toEqual([en['parent.none'], `${M} Milestone (milestone)`, `${E} Epic (epic)`, `${K} Feature (feature)`]);
    expect(ui.q('.picker [aria-current="true"]').textContent).toContain(E);

    await pick('.inspector', K);
    expect(ui.port.mutations[0]?.args).toEqual([T, `rev-${T}`, { kind: 'parent', parentId: K }]);
    expect(ui.q('.inspector').textContent).toContain(en['row.saving']);

    await ui.answer(0, { ok: true, value: detail(T, { parentId: K }) });
    expect(ui.q('.inspector').textContent).toContain(en['parent.saved']);
    expect(ui.el.querySelector('.picker')).toBeNull();
  });

  it('filters the picker by search, picks the first match with Enter and closes with Escape', async () => {
    const { ui, offered, click, inSection } = await shown(T);
    await click(inSection(en['inspector.parent'], en['parent.change']));
    const search = ui.q<HTMLInputElement>('.picker input');

    await ui.text(search, 'feature');
    expect(offered()).toEqual([en['parent.none'], `${K} Feature (feature)`]);
    await ui.text(search, 'zzz');
    expect(ui.q('.picker').textContent).toContain(en['picker.none']);
    ui.key(search, 'Escape');
    await settle();
    expect(ui.el.querySelector('.picker')).toBeNull();

    await click(inSection(en['inspector.parent'], en['parent.change']));
    await ui.text(ui.q<HTMLInputElement>('.picker input'), 'feature');
    ui.key(ui.q('.picker input'), 'Enter');
    await settle();
    expect(ui.port.mutations[0]?.args[2]).toEqual({ kind: 'parent', parentId: K });
  });

  it('never offers the bean or its descendants', async () => {
    const { offered, click, inSection } = await shown(E);

    await click(inSection(en['inspector.parent'], en['parent.change']));

    expect(offered().join('|')).not.toContain(T);
    expect(offered().join('|')).not.toContain(E);
  });

  it('removes the parent from the picker or the button, and explains a rejection without changing the shown parent', async () => {
    const { ui, click, inSection, section } = await shown(T);

    await click(inSection(en['inspector.parent'], en['parent.remove']));
    expect(ui.port.mutations[0]?.args[2]).toEqual({ kind: 'parent', parentId: null });
    await ui.answer(0, rejected('task beans can only have milestone, epic, or feature as parent'));

    expect(section(en['inspector.parent']).querySelector('[role="alert"]')?.textContent).toContain('Beans rejected the change: task beans can only have');
    expect(section(en['inspector.parent']).querySelector('nav')?.textContent).toContain(E);

    await click(inSection(en['inspector.parent'], en['action.dismiss']));
    await click(inSection(en['inspector.parent'], en['parent.change']));
    await click(ui.q('.picker li button'));
    expect(ui.port.mutations[1]?.args[2]).toEqual({ kind: 'parent', parentId: null });
  });

  it('shows a conflict and does not guess', async () => {
    const { ui, click, inSection, section } = await shown(T);

    await click(inSection(en['inspector.parent'], en['parent.remove']));
    await ui.answer(0, conflict(detail(T, { parentId: K })));

    expect(section(en['inspector.parent']).textContent).toContain(en['error.conflict']);
  });

  it('disables the editor for a milestone and says why', async () => {
    const { section } = await shown(M);

    expect(section(en['inspector.parent']).textContent).toContain(en['parent.milestone']);
    expect(section(en['inspector.parent']).querySelector('button')).toBeNull();
  });

  it('names a parent that does not exist and a parent loop instead of failing', async () => {
    const lost = await shown(U, [bean(U, { parentId: 'FX-zzzzz' })]);
    expect(lost.section(en['inspector.parent']).textContent).toContain('FX-zzzzz (not found)');

    const loop = await shown(U, [bean(U, { parentId: K, type: 'epic' }), bean(K, { parentId: U, type: 'epic' })]);
    expect(loop.section(en['inspector.parent']).textContent).toContain(en['parent.loop']);
  });
});

describe('blocker editors', () => {
  it('adds a blocker and a blocked bean, each in the field of the bean being edited', async () => {
    const { ui, pick, click, inSection } = await shown(T);

    await click(inSection(en['inspector.blockedBy'], en['links.addBlockedBy']));
    await pick('.inspector', U);
    expect(ui.port.mutations[0]?.args).toEqual([T, `rev-${T}`, { kind: 'blocking', field: 'blocked-by', action: 'add', targetId: U }]);
    await ui.answer(0, { ok: true, value: detail(T, { blockedByIds: [U] }) });
    expect(ui.q('.inspector').textContent).toContain(en['links.added']);

    await click(inSection(en['inspector.blocks'], en['links.addBlocks']));
    await pick('.inspector', K);
    expect(ui.port.mutations[1]?.args[2]).toEqual({ kind: 'blocking', field: 'blocking', action: 'add', targetId: K });
  });

  it('does not offer the bean itself or a bean already linked in that direction', async () => {
    const { offered, click, inSection } = await shown(T, [...tree().slice(0, 2), bean(T, { type: 'task', parentId: E, blockedByIds: [U] }), bean(U), bean(K, { type: 'feature' })]);

    await click(inSection(en['inspector.blockedBy'], en['links.addBlockedBy']));

    expect(offered().join('|')).not.toContain(T);
    expect(offered().join('|')).not.toContain(U);
    expect(offered().join('|')).toContain(K);
  });

  it('shows both storage directions and removes each through the field that stores it', async () => {
    // T is blocked by U (stored on T) and blocks K (stored on K as blocked_by); K also waits for nothing else.
    const { ui, section, click } = await shown(T, [bean(T, { blockedByIds: [U] }), bean(U), bean(K, { blockedByIds: [T] })]);

    expect(section(en['inspector.blockedBy']).textContent).toContain(U);
    expect(section(en['inspector.blocks']).textContent).toContain(K);

    await click(ui.q(`button[aria-label="${en['links.remove'].replace('{id}', U)}"]`));
    expect(ui.port.mutations[0]?.args).toEqual([T, `rev-${T}`, { kind: 'blocking', field: 'blocked-by', action: 'remove', targetId: U }]);
    await ui.answer(0, { ok: true, value: detail(T) });
    expect(ui.q('.inspector').textContent).toContain(en['links.removed']);

    await click(ui.q(`button[aria-label="${en['links.remove'].replace('{id}', K)}"]`));
    expect(ui.port.mutations[1]?.args).toEqual([K, `rev-${K}`, { kind: 'blocking', field: 'blocked-by', action: 'remove', targetId: T }]);
  });

  it('removes a link that the other bean stores in its blocking field, and stops at the first failed step', async () => {
    const { ui, click } = await shown(T, [bean(T, { blockedByLinkIds: [U] }), bean(U, { blockingIds: [T] })]);

    await click(ui.q(`button[aria-label="${en['links.remove'].replace('{id}', U)}"]`));

    expect(ui.port.mutations[0]?.args).toEqual([U, `rev-${U}`, { kind: 'blocking', field: 'blocking', action: 'remove', targetId: T }]);
    await ui.answer(0, rejected('nope'));
    expect(ui.q('.inspector [role="alert"]').textContent).toContain('nope');
    expect(ui.port.mutations).toHaveLength(1);
  });

  it('rejects a loop that mixes both directions locally, explains it and leaves the links alone', async () => {
    // U blocks T (stored on U); adding "T blocks U" would close a loop that Beans itself accepts.
    const { ui, pick, click, inSection } = await shown(T, [bean(T, { blockedByLinkIds: [U] }), bean(U, { blockingIds: [T] })]);

    await click(inSection(en['inspector.blocks'], en['links.addBlocks']));
    await pick('.inspector', U);

    expect(ui.port.mutations).toHaveLength(0);
    expect(ui.q('.inspector [role="alert"]').textContent).toContain(`${T} would block ${U}`);
    expect(inSection(en['inspector.blockedBy'], en['links.addBlockedBy']).closest('section')?.textContent).toContain(`${U} Title ${U}`);
  });

  it('warns about a loop that already exists', async () => {
    const { ui } = await shown(T, [bean(T, { blockingIds: [U] }), bean(U, { blockingIds: [T] })]);

    expect(ui.q('.inspector').textContent).toContain(en['links.cycle']);
  });

  it('names a missing target and lets it be removed', async () => {
    const { ui, click } = await shown(T, [bean(T, { blockedByIds: ['FX-zzzzz'] })]);

    expect(ui.q('.inspector').textContent).toContain('FX-zzzzz (not found)');
    await click(ui.q(`button[aria-label="${en['links.remove'].replace('{id}', 'FX-zzzzz')}"]`));
    expect(ui.port.mutations[0]?.args).toEqual([T, `rev-${T}`, { kind: 'blocking', field: 'blocked-by', action: 'remove', targetId: 'FX-zzzzz' }]);
  });

  it('disables the editors while the bean is saving', async () => {
    const { ui, click, inSection } = await shown(T);
    await click(inSection(en['inspector.parent'], en['parent.remove']));

    expect(inSection(en['inspector.blocks'], en['links.addBlocks']).disabled).toBe(true);
    await ui.answer(0, { ok: true, value: detail(T) });
  });
});

describe('keys', () => {
  it('p picks the parent and b a bean to block, for the shown bean only, whatever is selected in the list', async () => {
    const { ui, pick } = await shown(T);
    ui.state.setSelected([U, K]);

    ui.key(ui.q('.inspector h2'), 'p');
    await settle();
    expect(ui.q('.picker').getAttribute('aria-label')).toBe(en['parent.pick']);
    ui.key(ui.q('.picker input'), 'Escape');
    await settle();

    ui.key(ui.q('.inspector h2'), 'b');
    await settle();
    expect(ui.q('.picker').getAttribute('aria-label')).toBe(en['links.pickBlocks']);
    await pick('.inspector', K);
    expect(ui.port.mutations.map((one) => one.args[0])).toEqual([T]);
  });

  it('ignore p on a milestone, and while typing', async () => {
    const { ui } = await shown(M);
    ui.key(ui.q('.inspector h2'), 'p');
    await settle();
    expect(ui.el.querySelector('.picker')).toBeNull();

    ui.key(ui.field(`title`, M), 'b');
    await settle();
    expect(ui.el.querySelector('.picker')).toBeNull();
  });
});

describe('type changes', () => {
  it('disables a type the parent or children would not accept and says why', async () => {
    const { ui } = await shown(E);

    const options = [...ui.q<HTMLSelectElement>(`#field-type-${E}`).options];
    expect(options.filter((one) => one.disabled).map((one) => one.value)).toEqual(['milestone', 'epic', 'bug', 'task'].filter((type) => type !== 'epic'));
    expect(ui.q('.fields').textContent).toContain('Not available: milestone.');
  });
});

describe('new child', () => {
  it('opens the form under the parent, creates the child there and cancels without creating anything', async () => {
    const { ui, click } = await shown(E);

    await ui.press(en['children.new']);
    expect(ui.q('.create').textContent).toContain(en['create.parent'].replace('{id}', E));
    await ui.press(en['create.cancel']);
    expect(ui.port.creations).toHaveLength(0);
    expect(ui.el.querySelector('.create')).toBeNull();

    await click(ui.buttonIn('.pane-detail', en['children.new']));
    await ui.text(ui.q<HTMLInputElement>('#create-title'), 'Child');
    await ui.press(en['create.submit']);
    expect(ui.port.creations[0]?.args).toEqual([{ title: 'Child', parentId: E }]);

    ui.port.creations[0]?.settle({ ok: true, value: detail('FX-nnnnn', { title: 'Child', parentId: E }) });
    await settle();
    expect(ui.el.querySelector('.create')).toBeNull();
  });

  it('offers no new child for a type that cannot have one', async () => {
    const { ui } = await shown(T);

    expect(ui.q('.inspector').textContent).toContain(en['children.none'].replace('{type}', 'task'));
    expect([...ui.el.querySelectorAll('.inspector button')].some((one) => one.textContent === en['children.new'])).toBe(false);
  });

  it('keeps the form and the parent after Beans rejects the child, and the parent can be removed', async () => {
    const { ui } = await shown(M);
    await ui.press(en['children.new']);
    await ui.text(ui.q<HTMLInputElement>('#create-title'), 'Bad');
    await ui.press(en['create.submit']);
    ui.port.creations[0]?.settle({ ok: false, error: { kind: 'validation', code: 'backend', message: 'epic beans can only have milestone as parent' } });
    await settle();

    expect(ui.q('.create').textContent).toContain('epic beans can only have milestone as parent');
    expect(ui.q('.create').textContent).toContain(en['create.parent'].replace('{id}', M));
    await ui.press(en['create.parentRemove']);
    expect(ui.q('.create').textContent).not.toContain(en['create.parent'].replace('{id}', M));
  });
});

describe('issue tab', () => {
  it('creates a child from the tab and opens it with a way back', async () => {
    const made = await loaded(tree());
    const host = new TestHost(made.state);
    const el = document.body.appendChild(document.createElement('div'));
    mounts.push(mount(IssueTab, { target: el, props: { host, id: E, onClose: () => undefined } }));
    await settle();

    [...el.querySelectorAll('button')].find((one) => one.textContent === en['children.new'])?.click();
    await settle();
    expect(el.textContent).toContain(en['create.parent'].replace('{id}', E));
    [...el.querySelectorAll('button')].find((one) => one.textContent === en['create.cancel'])?.click();
    await settle();

    expect(el.querySelector('.inspector')).not.toBeNull();
    expect(made.port.creations).toHaveLength(0);
  });
});
