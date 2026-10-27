// @vitest-environment jsdom
import { mount } from 'svelte';
import { describe, expect, it } from 'vitest';
import IssueTab from '../../src/views/IssueTab.svelte';
import { en } from '../../src/views/messages.en.ts';
import { A, B, backend, bean, detail, loaded } from '../state/support.ts';
import { beans, conflict, mounts, open, rejected, settle, stored, TestHost, writeText } from './ui.ts';

describe('inspector fields', () => {
  it('shows editable fields, timestamps and the source actions of the selected bean', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A);

    expect(ui.field<HTMLInputElement>('title').value).toBe('Alpha');
    expect(ui.field<HTMLSelectElement>('status').value).toBe('todo');
    expect(ui.field<HTMLInputElement>('tags').value).toBe('ui');
    expect(ui.q('.times').textContent).toBe('Created 2026-10-26 20:00 UTC · Updated 2026-10-26 20:00 UTC');
    for (const label of [en['action.openSource'], en['copy.current'], en['action.copyLink']]) expect(ui.buttonIn('.pane-detail', label)).toBeTruthy();
  });

  it('saves a title as one field change, shows it pending, then confirms it at the field', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A);
    expect(ui.el.querySelector('.pane-detail .fields .buttons')).toBeNull();

    await ui.text(ui.field<HTMLInputElement>('title'), 'New title');
    await ui.press(en['field.save']);

    expect(ui.port.mutations[0]?.args).toEqual([A, `rev-${A}`, { kind: 'fields', title: 'New title' }]);
    expect(ui.q('.pane-detail').textContent).toContain(en['row.saving']);
    expect(ui.field<HTMLInputElement>('title').disabled).toBe(true);

    await ui.answer(0, { ok: true, value: detail(A, { title: 'New title' }) });

    expect(ui.field<HTMLInputElement>('title').value).toBe('New title');
    expect(ui.field<HTMLInputElement>('title').disabled).toBe(false);
    expect(ui.q('.pane-detail').textContent).toContain(en['field.saved']);
    expect(ui.q('.inspector h2').textContent).toBe('New title');
  });

  it('saves with Enter, reverts an unsaved edit and ignores Enter while the bean is busy', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A);
    const title = ui.field<HTMLInputElement>('title');

    await ui.text(title, 'Edited');
    await ui.press(en['field.revert']);
    expect(title.value).toBe('Alpha');

    await ui.text(title, 'Edited');
    ui.key(title, 'Enter');
    await settle();
    expect(ui.port.mutations).toHaveLength(1);

    ui.key(title, 'Enter');
    ui.key(title, 'a');
    await settle();
    expect(ui.port.mutations).toHaveLength(1);
  });

  it('saves tags as the complete list in the typed order, and reverts them', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A);
    const tags = ui.field<HTMLInputElement>('tags');

    await ui.text(tags, 'zeta, alpha ui');
    await ui.press(en['field.revert']);
    expect(tags.value).toBe('ui');

    await ui.text(tags, 'zeta, alpha ui');
    ui.key(tags, 'Enter');
    await settle();

    expect(ui.port.mutations[0]?.args[2]).toEqual({ kind: 'fields', tags: ['zeta', 'alpha', 'ui'] });
    await ui.answer(0, { ok: true, value: detail(A, { tags: ['zeta', 'alpha', 'ui'] }) });
    expect(tags.value).toBe('zeta alpha ui');
  });

  it('shows the asked-for value while pending and puts the stored one back after a failure, with the reason', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A);
    const status = ui.field<HTMLSelectElement>('status');

    await ui.choose(status, 'completed');
    expect(ui.port.mutations[0]?.args[2]).toEqual({ kind: 'fields', status: 'completed' });
    expect(status.value).toBe('completed');

    await ui.answer(0, rejected('no way'));
    expect(status.value).toBe('todo');
    expect(ui.q('.pane-detail [role="alert"]').textContent).toContain('Beans rejected the change: no way');

    await ui.press(en['action.dismiss']);
    expect(ui.el.querySelector('.pane-detail [role="alert"]')).toBeNull();
  });

  it('offers to apply the same change again on top of the newer revision after a conflict', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A);

    await ui.choose(ui.field<HTMLSelectElement>('priority'), 'high');
    await ui.answer(0, conflict(detail(A, { revision: 'rev-new', priority: 'low' })));
    expect(ui.q('.pane-detail [role="alert"]').textContent).toContain(en['error.conflict']);
    expect(ui.q('.pane-detail').textContent).toContain('Your value: "high". Current value: "low".');

    await ui.press(en['row.applyAgain']);

    expect(ui.port.mutations[1]?.args).toEqual([A, 'rev-new', { kind: 'fields', priority: 'high' }]);
  });

  it('offers no second attempt when the conflicting bean is gone, and keeps uncertain writes locked until checked', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A);

    await ui.choose(ui.field<HTMLSelectElement>('type'), 'bug');
    await ui.answer(0, conflict(null));
    expect(() => ui.buttonIn('.pane-detail', en['row.applyAgain'])).toThrow();
    await ui.press(en['action.dismiss']);

    await ui.choose(ui.field<HTMLSelectElement>('type'), 'bug');
    await ui.answer(1, { ok: false, error: { kind: 'uncertain', message: 'lost', current: null, createdIds: [] } });
    expect(ui.field<HTMLSelectElement>('type').disabled).toBe(true);
    await ui.press(en['save.reconciled']);
    expect(ui.field<HTMLSelectElement>('type').disabled).toBe(false);
  });

  it('keeps a bean Beans cannot rewrite safely read-only and says why', async () => {
    const ui = await open(await loaded([bean(A, { problems: ['bad-value'] })]));
    await ui.show(A);

    expect(ui.q('.pane-detail').textContent).toContain('bad-value');
    expect(ui.field<HTMLInputElement>('title').disabled).toBe(true);
    expect(ui.field<HTMLSelectElement>('status').disabled).toBe(true);
    expect(ui.buttonIn('.pane-detail', en['description.edit']).disabled).toBe(true);
  });

  it('lists a status the vocabulary does not know instead of showing another one', async () => {
    const ui = await open(await loaded([bean(A, { status: 'weird' })]));
    await ui.show(A);

    expect(ui.field<HTMLSelectElement>('status').value).toBe('weird');
  });
});

describe('description', () => {
  it('draws the description through the host, read again whenever the bean changes', async () => {
    const made = await loaded(beans());
    const ui = await open(made);
    expect(ui.el.querySelector('.description')).toBeNull();

    await ui.show(A, { body: '\nHello **world**' });
    expect(ui.q('.rendered').textContent).toBe('\nHello **world**');

    const reads = made.port.gets.length;
    const refreshed = made.state.refresh();
    made.port.lastList.settle({ ok: true, value: { beans: [bean(A, { revision: 'rev-2' })], invalid: [], blockedIds: [], readyIds: [A] } });
    await refreshed;
    await settle();
    expect(made.port.gets).toHaveLength(reads + 1);
    made.port.gets.at(-1)?.settle({ ok: true, value: detail(A, { revision: 'rev-2', body: '\nChanged' }) });
    await settle();
    expect(ui.q('.rendered').textContent).toBe('\nChanged');
    expect(ui.host.released).toEqual([A]);
  });

  it('says so for an empty description, a missing bean and a failed read, and retries the read', async () => {
    const made = await loaded(beans());
    const ui = await open(made);

    await ui.show(A, { body: '' });
    expect(ui.q('.description').textContent).toContain(en['description.empty']);

    ui.q<HTMLElement>(`button.row[data-id="${B}"]`).click();
    await settle();
    made.port.gets.at(-1)?.settle({ ok: true, value: null });
    await settle();
    expect(ui.q('.description').textContent).toContain(en['description.gone']);

    ui.q<HTMLElement>(`button.row[data-id="${A}"]`).click();
    await settle();
    made.port.gets.at(-1)?.settle({ ok: false, error: backend('timeout', 'slow') });
    await settle();
    expect(ui.q('.description [role="alert"]').textContent).toContain('Beans failed: slow');

    await ui.press(en['action.retry']);
    made.port.gets.at(-1)?.settle({ ok: true, value: detail(A, { body: '\nBack' }) });
    await settle();
    expect(ui.q('.rendered').textContent).toBe('\nBack');
  });

  it('ignores an older read that answers after a newer one', async () => {
    const made = await loaded(beans());
    const ui = await open(made);
    ui.q<HTMLElement>(`button.row[data-id="${A}"]`).click();
    await settle();
    const first = made.port.gets[0];
    const refreshed = made.state.refresh();
    made.port.lastList.settle({ ok: true, value: { beans: [bean(A, { revision: 'rev-2' }), bean(B)], invalid: [], blockedIds: [], readyIds: [] } });
    await refreshed;
    await settle();

    made.port.gets[1]?.settle({ ok: true, value: detail(A, { revision: 'rev-2', body: '\nNew' }) });
    await settle();
    first?.settle({ ok: true, value: detail(A, { body: '\nOld' }) });
    await settle();

    expect(ui.q('.rendered').textContent).toBe('\nNew');
  });

  it('edits with Save and Cancel, keeping a draft while typing and removing it when saved', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A, { body: '\nHello' });

    await ui.press(en['description.edit']);
    const editor = ui.q<HTMLTextAreaElement>(`#description-text-${A}`);
    expect(editor.value).toBe('Hello');
    expect(document.activeElement).toBe(editor);

    await ui.text(editor, 'Hello again');
    expect(ui.drafts()).toEqual(['Hello again']);
    await ui.text(editor, 'Hello');
    expect(ui.drafts()).toEqual([]);

    await ui.text(editor, 'Hello again');
    await ui.press(en['description.save']);
    expect(ui.port.mutations[0]?.args).toEqual([A, `rev-${A}`, { kind: 'body', body: 'Hello again' }]);
    expect(ui.q('.pane-detail').textContent).toContain(en['row.saving']);

    await ui.answer(0, { ok: true, value: detail(A, { revision: 'rev-2', body: '\nHello again' }) });

    expect(ui.el.querySelector('textarea')).toBeNull();
    expect(ui.q('.rendered').textContent).toBe('\nHello again');
    expect(ui.drafts()).toEqual([]);
  });

  it('cancels an edit and discards its draft', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A, { body: '\nHello' });
    await ui.press(en['description.edit']);
    await ui.text(ui.q<HTMLTextAreaElement>(`#description-text-${A}`), 'Typed');

    await ui.press(en['description.cancel']);

    expect(ui.el.querySelector('textarea')).toBeNull();
    expect(ui.drafts()).toEqual([]);
    expect(ui.port.mutations).toHaveLength(0);
  });

  it('keeps the text and its draft when the save fails, and saves again', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A, { body: '\nHello' });
    await ui.press(en['description.edit']);
    await ui.text(ui.q<HTMLTextAreaElement>(`#description-text-${A}`), 'Precious text');
    await ui.press(en['description.save']);

    await ui.answer(0, { ok: false, error: backend('timeout', 'slow') });

    expect(ui.q<HTMLTextAreaElement>(`#description-text-${A}`).value).toBe('Precious text');
    expect(ui.q('.pane-detail [role="alert"]').textContent).toContain('Beans failed: slow');
    expect(ui.drafts()).toEqual(['Precious text']);

    await ui.press(en['action.dismiss']);
    await ui.press(en['description.save']);
    expect(ui.port.mutations[1]?.args[2]).toEqual({ kind: 'body', body: 'Precious text' });
  });

  it('reviews a conflict with both versions and never overwrites without a choice', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A, { body: '\nOriginal' });
    await ui.press(en['description.edit']);
    await ui.text(ui.q<HTMLTextAreaElement>(`#description-text-${A}`), 'Mine');
    await ui.press(en['description.save']);

    await ui.answer(0, conflict(detail(A, { revision: 'rev-2', body: '\nTheirs' }), 'body'));

    const review = ui.q('.review');
    expect(review.textContent).toContain(en['description.review']);
    expect([...review.querySelectorAll('pre')].map((one) => one.textContent)).toEqual(['Mine', 'Theirs']);
    expect(ui.buttonIn('.pane-detail', en['description.save']).disabled).toBe(true);
    expect(ui.port.mutations).toHaveLength(1);

    await ui.press(en['description.overwrite']);
    expect(ui.port.mutations[1]?.args).toEqual([A, 'rev-2', { kind: 'body', body: 'Mine' }]);
  });

  it('takes the current text when asked, dropping the draft', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A, { body: '\nOriginal' });
    await ui.press(en['description.edit']);
    await ui.text(ui.q<HTMLTextAreaElement>(`#description-text-${A}`), 'Mine');
    await ui.press(en['description.save']);
    await ui.answer(0, conflict(detail(A, { revision: 'rev-2', body: '\nTheirs' }), 'body'));

    await ui.press(en['description.useCurrent']);

    expect(ui.el.querySelector('textarea')).toBeNull();
    expect(ui.drafts()).toEqual([]);
    expect(ui.port.mutations).toHaveLength(1);
  });

  it('continues from the current version after a review, and the next save is guarded by it', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A, { body: '\nOriginal' });
    await ui.press(en['description.edit']);
    await ui.text(ui.q<HTMLTextAreaElement>(`#description-text-${A}`), 'Mine');
    await ui.press(en['description.save']);
    await ui.answer(0, conflict(detail(A, { revision: 'rev-2', body: '\nTheirs' }), 'body'));

    await ui.press(en['description.keepEditing']);

    expect(ui.el.querySelector('.review')).toBeNull();
    expect(ui.q<HTMLTextAreaElement>(`#description-text-${A}`).value).toBe('Mine');
    await ui.press(en['description.save']);
    expect(ui.port.mutations[1]?.args[1]).toBe('rev-2');
  });

  it('keeps the text for copying when the bean was deleted meanwhile', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A, { body: '\nOriginal' });
    await ui.press(en['description.edit']);
    await ui.text(ui.q<HTMLTextAreaElement>(`#description-text-${A}`), 'Mine');
    await ui.press(en['description.save']);
    await ui.answer(0, conflict(null));

    expect(ui.q('.review').textContent).toContain(en['description.deleted']);
    expect(() => ui.buttonIn('.review', en['description.overwrite'])).toThrow();

    await ui.press(en['action.copyText']);
    expect(writeText).toHaveBeenCalledWith('Mine');
    writeText.mockRejectedValue(new Error('denied'));
    await ui.press(en['action.copyText']);
    expect(ui.q<HTMLTextAreaElement>(`#description-text-${A}`).value).toBe('Mine');
  });

  it('offers a stored draft, restores it as an edit and can discard it', async () => {
    const ui = await open(await loaded(beans(), {}, { drafts: [stored()] }));
    await ui.show(A, { body: '\nOriginal' });

    expect(ui.q('.banner').textContent).toContain('Unsaved description draft from 2026-10-26 20:00 UTC.');
    await ui.press(en['description.restore']);
    expect(ui.q<HTMLTextAreaElement>(`#description-text-${A}`).value).toBe('Draft text');
    expect(ui.el.querySelector('.review')).toBeNull();

    await ui.press(en['description.cancel']);
    expect(ui.drafts()).toEqual([]);

    const again = await open(await loaded(beans(), {}, { drafts: [stored()] }));
    await again.show(A);
    await again.press(en['description.discard']);
    expect(again.drafts()).toEqual([]);
    expect(again.el.querySelector('.banner')).toBeNull();
  });

  it('opens conflict review at once for a draft of a bean that changed since', async () => {
    const ui = await open(await loaded(beans(), {}, { drafts: [stored({ revision: 'rev-old' })] }));
    await ui.show(A, { body: '\nRemote' });
    expect(ui.q('.banner').textContent).toContain('The bean has changed since.');

    ui.buttonIn('.banner', en['description.restore']).click();
    await settle();
    ui.port.gets.at(-1)?.settle({ ok: true, value: detail(A, { body: '\nRemote' }) });
    await settle();

    expect([...ui.q('.review').querySelectorAll('pre')].map((one) => one.textContent)).toEqual(['Draft text', 'Remote']);
    expect(ui.port.mutations).toHaveLength(0);
    await ui.press(en['description.keepEditing']);
    await ui.press(en['description.save']);
    expect(ui.port.mutations[0]?.args).toEqual([A, `rev-${A}`, { kind: 'body', body: 'Draft text' }]);
  });

  it('reviews against nothing when the fresh read fails while restoring', async () => {
    const ui = await open(await loaded(beans(), {}, { drafts: [stored({ revision: 'rev-old' })] }));
    await ui.show(A);

    ui.buttonIn('.banner', en['description.restore']).click();
    await settle();
    ui.port.gets.at(-1)?.settle({ ok: false, error: backend('timeout') });
    await settle();

    expect(ui.q('.review').textContent).toContain(en['description.deleted']);
  });

  it('does nothing for editing shortcuts before the description is read or while the bean is locked', async () => {
    const ui = await open(await loaded([bean(A, { problems: ['invalid-file'] })]));
    ui.q<HTMLElement>(`button.row[data-id="${A}"]`).click();
    await settle();

    ui.key(ui.q('.inspector h2'), 'e');
    await settle();

    expect(ui.el.querySelector('textarea')).toBeNull();
  });
});

describe('checklist', () => {
  const body = '\nIntro\n- [ ] same\n- [ ] same\n- [x] done';

  it('changes only the clicked item, by its exact line, even when item texts repeat', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A, { body });
    const boxes = [...ui.el.querySelectorAll<HTMLInputElement>('.checklist input')];
    expect(boxes.map((box) => box.checked)).toEqual([false, false, true]);

    boxes[1]?.click();
    await settle();

    expect(ui.port.mutations[0]?.args[2]).toEqual({ kind: 'checklist', line: 3, text: '- [ ] same', checked: true });
    await ui.answer(0, { ok: true, value: detail(A, { revision: 'rev-2', body: '\nIntro\n- [ ] same\n- [x] same\n- [x] done' }) });
    expect([...ui.el.querySelectorAll<HTMLInputElement>('.checklist input')].map((box) => box.checked)).toEqual([false, true, true]);
  });

  it('puts the box back and shows the reason when the change is refused', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A, { body });
    const box = ui.q<HTMLInputElement>('.checklist input');

    box.click();
    await settle();
    await ui.answer(0, conflict(detail(A, { body: '\nIntro\n- [x] other' }), 'body'));

    expect(box.checked).toBe(false);
    expect(ui.q('.description [role="alert"]').textContent).toContain(en['error.conflict']);
  });
});

describe('source note actions, shortcuts and orphaned drafts', () => {
  it('copies the ID and the note link, and says when there is nothing to link or copying fails', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A);

    await ui.press(en['copy.current']);
    expect(writeText).toHaveBeenLastCalledWith(A);
    expect(ui.q('.note').textContent).toBe('Copied 1 ID.');

    await ui.press(en['action.copyLink']);
    expect(writeText).toHaveBeenLastCalledWith('[[FX-aaaaa--x]]');
    expect(ui.q('.note').textContent).toBe(en['copy.linkDone']);

    ui.host.link = undefined;
    await ui.press(en['action.copyLink']);
    expect(ui.q('.note').textContent).toBe(en['source.missing']);

    writeText.mockRejectedValue(new Error('denied'));
    await ui.press(en['copy.current']);
    expect(ui.q('.note').textContent).toBe(en['copy.failed']);
  });

  it('opens the source note by full ID and says when the file cannot be found', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A);

    await ui.press(en['action.openSource']);
    expect(ui.host.sources).toEqual([A]);
    expect(ui.q('.note').textContent).toBe('');

    ui.host.sourceFound = false;
    await ui.press(en['action.openSource']);
    expect(ui.q('.note').textContent).toBe(en['source.missing']);
  });

  it('supports the detail keys of the TUI outside text fields only', async () => {
    const ui = await open(await loaded(beans()));
    await ui.show(A, { body: '\nHello' });
    const heading = ui.q('.inspector h2');

    ui.key(heading, 's');
    expect(document.activeElement).toBe(ui.field('status'));
    ui.key(heading, 't');
    expect(document.activeElement).toBe(ui.field('type'));
    ui.key(heading, 'P');
    expect(document.activeElement).toBe(ui.field('priority'));
    ui.key(heading, 'y');
    await settle();
    expect(writeText).toHaveBeenLastCalledWith(A);
    ui.key(heading, 'z');

    ui.key(ui.field('title'), 's');
    expect(document.activeElement).toBe(ui.field('priority'));

    ui.key(heading, 'e');
    await settle();
    expect(ui.el.querySelector(`#description-text-${A}`)).not.toBeNull();
  });

  it('shows the unsaved description of a bean that no longer exists, to copy or discard', async () => {
    const made = await loaded(beans(), {}, { drafts: [stored({ key: 'FX-zzzzz' })] });
    const host = new TestHost(made.state);
    const el = document.body.appendChild(document.createElement('div'));
    mounts.push(mount(IssueTab, { target: el, props: { host, id: 'FX-zzzzz', onClose: () => undefined } }));
    await settle();

    expect(el.textContent).toContain(en['inspector.orphanedDraft']);
    expect(el.querySelector('textarea')?.value).toBe('Draft text');
    [...el.querySelectorAll('button')].find((one) => one.textContent === en['action.copyText'])?.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith('Draft text');

    [...el.querySelectorAll('button')].find((one) => one.textContent === en['description.discard'])?.click();
    await settle();
    expect(el.querySelector('textarea')).toBeNull();
  });
});
