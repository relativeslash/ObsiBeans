import type { App, Editor, MarkdownFileInfo, MarkdownView, Menu, TFile } from 'obsidian';
import { afterSelection, anchorAt, locate, plainAlias } from '../state/note-text.ts';
import type { InsertMode, InsertOutcome, NoteTarget, RelatedNote, WorkspaceHost } from '../views/host.ts';
import { t } from '../views/i18n.ts';
import { openConvertDialog, openLinkDialog } from '../views/note-modal.ts';

/** What the note actions need from the plugin shell. */
export interface NotesSource {
  readonly host: WorkspaceHost;
  /** The bound task root inside the vault, or undefined while unbound. */
  taskRoot(): string | undefined;
  /** The bean's Markdown file, found by the path the project last listed for its full ID. */
  fileOf(id: string): TFile | null;
}

type Context = MarkdownView | MarkdownFileInfo;

const stem = (path: string): string => (path.split('/').at(-1) ?? path).replace(/\.md$/, '');

/**
 * Related notes, and the two editor commands: insert a bean link and convert the selection to a bean.
 * Links are resolved by Obsidian (`metadataCache`, `generateMarkdownLink`); note text is only ever data.
 */
export class NoteActions {
  private readonly app: App;
  private readonly source: NotesSource;

  constructor(app: App, source: NotesSource) {
    this.app = app;
    this.source = source;
  }

  /**
   * Notes linking to the bean's file and notes it links to, from Obsidian's resolved links, so moves done through
   * Obsidian are followed. ponytail: scans every note per call; index backlinks once if vaults get large.
   */
  related(id: string): RelatedNote[] {
    const file = this.source.fileOf(id);
    if (!file) return [];
    const { resolvedLinks } = this.app.metadataCache;
    const found: RelatedNote[] = [];
    for (const [path, targets] of Object.entries(resolvedLinks)) if (path !== file.path && file.path in targets) found.push({ kind: 'backlink', path });
    for (const path of Object.keys(resolvedLinks[file.path] ?? {})) if (path !== file.path) found.push({ kind: 'link', path });
    return found.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
  }

  async openNote(path: string): Promise<boolean> {
    const file = this.app.vault.getFileByPath(path);
    if (file) await this.app.workspace.getLeaf('tab').openFile(file);
    return file !== null;
  }

  /** The command is offered only in a note with a bound project, so an absent editor or unbound project never reaches the dialogs. */
  insertLink(checking: boolean, editor: Editor, context: Context): boolean {
    const target = this.source.host.state && this.capture(editor, context);
    if (target && !checking) openLinkDialog(this.app, this.source.host, target);
    return !!target;
  }

  /** Offered only with a non-empty selection, so an empty one never opens a dialog. */
  convertSelection(checking: boolean, editor: Editor, context: Context): boolean {
    const target = this.source.host.state && editor.getSelection().trim() !== '' && this.capture(editor, context);
    if (target && !checking) openConvertDialog(this.app, this.source.host, target);
    return !!target;
  }

  /** The same two actions in the editor's context menu, shown only where the command is available. */
  addMenuItems(menu: Menu, editor: Editor, context: Context): void {
    for (const [title, icon, available, run] of [
      [t('command.insertLink'), 'link', this.insertLink(true, editor, context), () => this.insertLink(false, editor, context)],
      [t('command.convertSelection'), 'list-plus', this.convertSelection(true, editor, context), () => this.convertSelection(false, editor, context)],
    ] as const) {
      if (available) menu.addItem((item) => item.setTitle(title).setIcon(icon).onClick(() => { run(); }));
    }
  }

  private beanLink(id: string, title: string, fromPath: string): string {
    const alias = plainAlias(title);
    const file = this.source.fileOf(id);
    if (file) return this.app.fileManager.generateMarkdownLink(file, fromPath, undefined, alias === '' ? undefined : alias);
    // Obsidian has not indexed the new file yet; the name is enough for it to resolve the link later.
    const path = this.source.host.state?.getSnapshot().beans.find((one) => one.id === id)?.path ?? id;
    return `[[${stem(path)}${alias === '' ? '' : `|${alias}`}]]`;
  }

  /** Remembers the selection (or the cursor) with the text around it. Undefined when the editor has no file. */
  private capture(editor: Editor, context: Context): NoteTarget | undefined {
    const file = context.file;
    if (!file) return undefined;
    const doc = editor.getValue();
    const anchor = anchorAt(doc, editor.posToOffset(editor.getCursor('from')), editor.posToOffset(editor.getCursor('to')));
    const root = this.source.taskRoot();
    const beanPath = root === undefined || root === '' ? 'bean.md' : `${root}/bean.md`;
    return {
      notePath: file.path,
      noteLink: this.app.fileManager.generateMarkdownLink(file, beanPath),
      text: anchor.text,
      link: (id, title) => this.beanLink(id, title, file.path),
      insert: (id, title, mode) => this.write(editor, context, file, anchor, mode, this.beanLink(id, title, file.path)),
    };
  }

  /** Writes only if the note is still open in the same editor and the selection is still where it was, or the only place it fits. */
  private write(editor: Editor, context: Context, file: TFile, anchor: ReturnType<typeof anchorAt>, mode: InsertMode, link: string): InsertOutcome {
    const open = this.app.workspace.getLeavesOfType('markdown').some((leaf) => leaf.view === context);
    if (!open || context.file !== file) return 'gone';
    const start = locate(editor.getValue(), anchor);
    if (start === undefined) return 'changed';
    const end = start + anchor.text.length;
    if (mode === 'replace' && anchor.text !== '') editor.replaceRange(link, editor.offsetToPos(start), editor.offsetToPos(end));
    else editor.replaceRange(afterSelection(anchor.text, link), editor.offsetToPos(end));
    return 'inserted';
  }
}
