import type { ViewChange, ViewEntry, ViewResult } from '../state/saved-views.ts';
import type { WorkspaceState } from '../state/workspace-state.ts';

/** Row spacing preference. */
export type Density = 'comfortable' | 'compact';
export const DENSITIES: readonly Density[] = ['comfortable', 'compact'];

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
}
