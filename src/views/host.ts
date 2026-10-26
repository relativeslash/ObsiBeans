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
  /** Calls `listener` whenever the binding or a setting changes. Returns the function that stops it. */
  onBindingChange(listener: () => void): () => void;
  /** Opens the bean in its own tab, or reveals the tab that already shows it. */
  openIssue(id: string): Promise<void>;
}
