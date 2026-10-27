// @vitest-environment jsdom
import type { Editor, MarkdownView, Menu, TFile } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteActions } from '../../src/plugin/notes.ts';
import type { NoteTarget, WorkspaceHost } from '../../src/views/host.ts';
import { openConvertDialog, openLinkDialog } from '../../src/views/note-modal.ts';
import { App, bridge, type View, type WorkspaceLeaf } from '../support/obsidian.ts';

vi.mock('../../src/views/note-modal.ts', () => ({ openConvertDialog: vi.fn(), openLinkDialog: vi.fn() }));

/** An editor over a string, with the offset/position conversions Obsidian's has. */
class FakeEditor {
  doc: string;
  from = 0;
  to = 0;

  constructor(doc: string) {
    this.doc = doc;
  }

  select(text: string, length = text.length): void {
    this.from = this.doc.indexOf(text);
    this.to = this.from + length;
  }

  getValue(): string {
    return this.doc;
  }

  getSelection(): string {
    return this.doc.slice(this.from, this.to);
  }

  posToOffset(pos: { line: number; ch: number }): number {
    return this.doc.split('\n').slice(0, pos.line).reduce((sum, line) => sum + line.length + 1, 0) + pos.ch;
  }

  offsetToPos(offset: number): { line: number; ch: number } {
    const before = this.doc.slice(0, offset).split('\n');
    return { line: before.length - 1, ch: before.at(-1)?.length ?? 0 };
  }

  getCursor(which: 'from' | 'to'): { line: number; ch: number } {
    return this.offsetToPos(which === 'from' ? this.from : this.to);
  }

  replaceRange(text: string, from: { line: number; ch: number }, to = from): void {
    this.doc = this.doc.slice(0, this.posToOffset(from)) + text + this.doc.slice(this.posToOffset(to));
  }
}

const NOTE: TFile = bridge<TFile>({ path: 'Notes/Shopping.md' });
const BEAN_FILE: TFile = bridge<TFile>({ path: 'Task root/FX-aaaaa--x.md' });
const DOC = 'Intro\n\nBuy milk and eggs today\n\nOutro';

interface Setup {
  app: App;
  actions: NoteActions;
  editor: FakeEditor;
  context: MarkdownView;
  leaf: WorkspaceLeaf;
  host: { state: unknown };
  files: Map<string, TFile>;
  root: { value: string | undefined };
}

function setup(): Setup {
  const app = new App('/vault');
  const editor = new FakeEditor(DOC);
  const context = bridge<MarkdownView>({ file: NOTE, editor, getViewType: () => 'markdown' });
  const leaf = app.workspace.getLeaf();
  leaf.view = bridge<View>(context);
  const files = new Map<string, TFile>([['FX-aaaaa', BEAN_FILE]]);
  const host = { state: { getSnapshot: () => ({ beans: [{ id: 'FX-aaaaa', path: 'FX-aaaaa--x.md' }, { id: 'FX-bbbbb', path: 'FX-bbbbb--y.md' }] }) } };
  const root = { value: 'Task root' as string | undefined };
  const actions = new NoteActions(bridge(app), { host: bridge<WorkspaceHost>(host), taskRoot: () => root.value, fileOf: (id) => files.get(id) ?? null });
  return { app, actions, editor, context, leaf, host, files, root };
}

/** Runs the command and returns the target it handed to the dialog. */
function target(run: () => boolean, open: typeof openLinkDialog): NoteTarget {
  vi.mocked(open).mockClear();
  expect(run()).toBe(true);
  const call = vi.mocked(open).mock.calls[0];
  if (!call) throw new Error('no dialog opened');
  return call[2];
}

beforeEach(() => {
  vi.mocked(openLinkDialog).mockClear();
  vi.mocked(openConvertDialog).mockClear();
});

describe('related notes', () => {
  it('lists the notes linking here and the notes linked from here, from Obsidian resolution, sorted', () => {
    const { app, actions, files } = setup();
    app.metadataCache.resolvedLinks = {
      'Notes/B.md': { 'Task root/FX-aaaaa--x.md': 2, 'Other.md': 1 },
      'Notes/A.md': { 'Task root/FX-aaaaa--x.md': 1 },
      'Task root/FX-aaaaa--x.md': { 'Notes/C.md': 1, 'Task root/FX-aaaaa--x.md': 1 },
      'Notes/Unrelated.md': { 'Other.md': 1 },
    };

    expect(actions.related('FX-aaaaa')).toEqual([
      { kind: 'backlink', path: 'Notes/A.md' },
      { kind: 'backlink', path: 'Notes/B.md' },
      { kind: 'link', path: 'Notes/C.md' },
    ]);
    expect(actions.related('FX-bbbbb')).toEqual([]);

    // A link-aware move of the bean file: the same ID now resolves to the new path and its links.
    files.set('FX-aaaaa', bridge<TFile>({ path: 'Archive/FX-aaaaa--x.md' }));
    app.metadataCache.resolvedLinks = { 'Notes/A.md': { 'Archive/FX-aaaaa--x.md': 1 } };
    expect(actions.related('FX-aaaaa')).toEqual([{ kind: 'backlink', path: 'Notes/A.md' }]);
  });

  it('lists both directions when a note links each way', () => {
    const { app, actions } = setup();
    app.metadataCache.resolvedLinks = { 'Notes/A.md': { 'Task root/FX-aaaaa--x.md': 1 }, 'Task root/FX-aaaaa--x.md': { 'Notes/A.md': 1 } };
    expect(actions.related('FX-aaaaa').map((one) => one.kind)).toEqual(['backlink', 'link']);
  });

  it('opens a note by path and reports one that is gone', async () => {
    const { app, actions } = setup();
    expect(await actions.openNote('Notes/A.md')).toBe(false);
    app.vault.files.add('Notes/A.md');
    expect(await actions.openNote('Notes/A.md')).toBe(true);
    expect(app.workspace.leaves.at(-1)?.opened).toEqual([{ path: 'Notes/A.md' }]);
  });
});

describe('command availability', () => {
  it('offers both commands only with a project and a note, and the conversion only with a selection', () => {
    const { actions, editor, context, host } = setup();
    const ed = bridge<Editor>(editor);

    expect(actions.insertLink(true, ed, context)).toBe(true);
    expect(actions.convertSelection(true, ed, context)).toBe(false);
    editor.select('   ');
    editor.from = editor.to = 3;
    expect(actions.convertSelection(true, ed, context)).toBe(false);
    editor.select('milk');
    expect(actions.convertSelection(true, ed, context)).toBe(true);
    expect(openLinkDialog).not.toHaveBeenCalled();
    expect(openConvertDialog).not.toHaveBeenCalled();

    expect(actions.insertLink(true, ed, bridge<MarkdownView>({ file: null, editor }))).toBe(false);
    host.state = undefined;
    expect(actions.insertLink(true, ed, context)).toBe(false);
    expect(actions.convertSelection(false, ed, context)).toBe(false);
    expect(openConvertDialog).not.toHaveBeenCalled();
  });

  it('adds menu items for the commands that are available', () => {
    const { actions, editor, context } = setup();
    const added: { title: string; icon: string; click: () => void }[] = [];
    const menu = bridge<Menu>({
      addItem: (build: (item: unknown) => void) => {
        const entry: { title: string; icon: string; click: () => void } = { title: '', icon: '', click: () => undefined };
        const item = { setTitle: (title: string) => { entry.title = title; return item; }, setIcon: (icon: string) => { entry.icon = icon; return item; }, onClick: (click: () => void) => { entry.click = click; return item; } };
        build(item);
        added.push(entry);
      },
    });

    actions.addMenuItems(menu, bridge<Editor>(editor), context);
    expect(added.map((one) => one.icon)).toEqual(['link']);
    editor.select('milk');
    actions.addMenuItems(menu, bridge<Editor>(editor), context);
    expect(added.map((one) => one.icon)).toEqual(['link', 'link', 'list-plus']);

    added[2]?.click();
    expect(openConvertDialog).toHaveBeenCalledTimes(1);
  });
});

describe('the captured target', () => {
  it('describes the note and the selection, and links the note from where a bean is stored', () => {
    const { app, actions, editor, context, root } = setup();
    editor.select('milk and eggs');
    const found = target(() => actions.convertSelection(false, bridge<Editor>(editor), context), openConvertDialog);

    expect(found).toMatchObject({ notePath: 'Notes/Shopping.md', noteLink: '[[Notes/Shopping.md]]', text: 'milk and eggs' });
    expect(app.fileManager.sources).toEqual(['Task root/bean.md']);

    root.value = '';
    target(() => actions.convertSelection(false, bridge<Editor>(editor), context), openConvertDialog);
    expect(app.fileManager.sources.at(-1)).toBe('bean.md');
  });

  it('links a bean by its file, with a safe alias, and by name until Obsidian has indexed the file', () => {
    const { actions, editor, context } = setup();
    const found = target(() => actions.insertLink(false, bridge<Editor>(editor), context), openLinkDialog);

    expect(found.link('FX-aaaaa', 'Fix [the] | thing')).toBe('[[Task root/FX-aaaaa--x.md|Fix the thing]]');
    expect(found.link('FX-bbbbb', 'New')).toBe('[[FX-bbbbb--y|New]]');
    expect(found.link('FX-bbbbb', '[]')).toBe('[[FX-bbbbb--y]]');
    expect(found.link('FX-zzzzz', '')).toBe('[[FX-zzzzz]]');
  });

  it('inserts after the selection and keeps the selected text', () => {
    const { actions, editor, context } = setup();
    editor.select('milk and eggs');
    const found = target(() => actions.convertSelection(false, bridge<Editor>(editor), context), openConvertDialog);

    expect(found.insert('FX-aaaaa', 'Milk', 'after')).toBe('inserted');
    expect(editor.doc).toBe('Intro\n\nBuy milk and eggs [[Task root/FX-aaaaa--x.md|Milk]] today\n\nOutro');
  });

  it('replaces only the selected text when asked to', () => {
    const { actions, editor, context } = setup();
    editor.select('milk and eggs');
    const found = target(() => actions.convertSelection(false, bridge<Editor>(editor), context), openConvertDialog);

    expect(found.insert('FX-aaaaa', 'Milk', 'replace')).toBe('inserted');
    expect(editor.doc).toBe('Intro\n\nBuy [[Task root/FX-aaaaa--x.md|Milk]] today\n\nOutro');
  });

  it('inserts at the cursor when nothing is selected, and never replaces text then', () => {
    const { actions, editor, context } = setup();
    editor.from = editor.to = DOC.indexOf('milk');
    const found = target(() => actions.insertLink(false, bridge<Editor>(editor), context), openLinkDialog);

    expect(found.insert('FX-aaaaa', 'Milk', 'replace')).toBe('inserted');
    expect(editor.doc).toBe('Intro\n\nBuy [[Task root/FX-aaaaa--x.md|Milk]]milk and eggs today\n\nOutro');
  });

  it('refuses to write when the selected text was edited, and writes after the edit is undone', () => {
    const { actions, editor, context } = setup();
    editor.select('milk and eggs');
    const found = target(() => actions.convertSelection(false, bridge<Editor>(editor), context), openConvertDialog);

    editor.doc = DOC.replace('milk', 'oat');
    const edited = editor.doc;
    expect(found.insert('FX-aaaaa', 'Milk', 'replace')).toBe('changed');
    expect(editor.doc).toBe(edited);

    editor.doc = DOC;
    expect(found.insert('FX-aaaaa', 'Milk', 'after')).toBe('inserted');
  });

  it('follows the selection when other text above it changed, and does not touch that text', () => {
    const { actions, editor, context } = setup();
    editor.select('milk and eggs');
    const found = target(() => actions.convertSelection(false, bridge<Editor>(editor), context), openConvertDialog);

    editor.doc = `New first line\n${DOC}`;
    expect(found.insert('FX-aaaaa', 'Milk', 'replace')).toBe('inserted');
    expect(editor.doc).toBe('New first line\nIntro\n\nBuy [[Task root/FX-aaaaa--x.md|Milk]] today\n\nOutro');
  });

  it('writes nothing when the note was closed, replaced in its tab, or its text is ambiguous', () => {
    const { actions, editor, context, leaf } = setup();
    editor.select('milk and eggs');
    const found = target(() => actions.convertSelection(false, bridge<Editor>(editor), context), openConvertDialog);

    editor.doc = `Moved\n${DOC}\n${DOC}`;
    expect(found.insert('FX-aaaaa', 'Milk', 'after')).toBe('changed');
    editor.doc = DOC;

    (context as { file: unknown }).file = bridge<TFile>({ path: 'Notes/Other.md' });
    expect(found.insert('FX-aaaaa', 'Milk', 'after')).toBe('gone');
    (context as { file: unknown }).file = NOTE;

    leaf.view = undefined;
    expect(found.insert('FX-aaaaa', 'Milk', 'after')).toBe('gone');
    expect(editor.doc).toBe(DOC);
  });
});
