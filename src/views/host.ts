import type { ViewChange, ViewEntry, ViewResult } from '../state/saved-views.ts';
import type { WorkspaceState } from '../state/workspace-state.ts';

/** Row spacing preference. */
export type Density = 'comfortable' | 'compact';
export const DENSITIES: readonly Density[] = ['comfortable', 'compact'];

/** A note Obsidian reports as linked with a bean's file: it links to the bean (`backlink`) or the bean links to it (`link`). */
export interface RelatedNote {
  readonly kind: 'backlink' | 'link';
  /** Vault-relative path. */
  readonly path: string;
}

/** `after` keeps the selected text and writes the link behind it; `replace` writes the link over it. */
export type InsertMode = 'after' | 'replace';
/** `changed`: the note no longer has the selection where it was; `gone`: its editor or file is no longer open. Nothing was written in either case. */
export type InsertOutcome = 'inserted' | 'changed' | 'gone';

/** The place in a note a command started from. The shell owns the editor; a target only writes where the note still matches what was captured. */
export interface NoteTarget {
  readonly notePath: string;
  /** A link to the note, in the user's link style, for a bean description. */
  readonly noteLink: string;
  /** The selected text; empty when only a cursor was captured. */
  readonly text: string;
  /** The link to a bean, in the user's link style. Works before Obsidian has indexed the bean's file. */
  link(id: string, title: string): string;
  /** Writes the link to the bean at the captured place, after checking that the place is unchanged. Never overwrites text it did not capture. */
  insert(id: string, title: string, mode: InsertMode): InsertOutcome;
}

/** What the views need from the plugin shell. Views never import the shell. */
export interface WorkspaceHost {
  /** The shared state of the bound project; undefined while unbound or checking. Replaced on every rebind. */
  readonly state: WorkspaceState | undefined;
  /** One translated line: checking, bound, or why binding failed. */
  readonly bindingText: string;
  readonly density: Density;
  /** The saved views, valid and invalid, in stored order. Plugin-local data, never bean data. */
  readonly savedViews: readonly ViewEntry[];
  /** Applies one change to the saved views and stores it. Fails with `storage` when the plugin data cannot be written. */
  changeViews(change: ViewChange): Promise<ViewResult>;
  /** Calls `listener` whenever the binding, a setting or the saved views change. Returns the function that stops it. */
  onBindingChange(listener: () => void): () => void;
  /** Opens the bean in its own tab, or reveals the tab that already shows it. */
  openIssue(id: string): Promise<void>;
  /**
   * Draws untrusted Markdown into `el` with Obsidian's renderer, which sanitizes it; task checkboxes are made
   * read-only because the inspector's checklist is the only way to change them. `id` names the bean for link
   * resolution. Returns the function that releases what was drawn.
   */
  renderMarkdown(markdown: string, el: HTMLElement, id: string): () => void;
  /** Opens the bean's Markdown file, resolved by its full ID. False when the file cannot be found in the vault. */
  openSource(id: string): Promise<boolean>;
  /** A link to the bean's file in the user's link style, or undefined when the file cannot be found. */
  sourceLink(id: string): string | undefined;
  /** The notes Obsidian resolves as linked with the bean's file, sorted by path. Re-read after `onBindingChange` fires. */
  relatedNotes(id: string): readonly RelatedNote[];
  /** Opens a note by vault path. False when it no longer exists. */
  openNote(path: string): Promise<boolean>;
}
