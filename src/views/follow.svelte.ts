import type { Snapshot } from '../state/model.ts';
import type { ViewEntry } from '../state/saved-views.ts';
import type { WorkspaceState } from '../state/workspace-state.ts';
import type { Density, WorkspaceHost } from './host.ts';

export interface Followed {
  readonly state: WorkspaceState | undefined;
  /** Immutable, replaced after every change; undefined while no project is bound. */
  readonly snapshot: Snapshot | undefined;
  readonly bindingText: string;
  readonly density: Density;
  readonly savedViews: readonly ViewEntry[];
  /** Stops following. Call when the component is destroyed. */
  stop(): void;
}

/**
 * Makes the host's current state and its snapshot reactive. Follows rebinds: the state object is replaced on every
 * rebind, so the subscription moves with it and a disposed state is never read again.
 */
export function follow(host: WorkspaceHost): Followed {
  let state = $state.raw(host.state);
  let snapshot = $state.raw(host.state?.getSnapshot());
  let bindingText = $state(host.bindingText);
  let density = $state(host.density);
  let savedViews = $state.raw(host.savedViews);
  let unsubscribe: (() => void) | undefined;

  const attach = (): void => {
    unsubscribe?.();
    state = host.state;
    snapshot = state?.getSnapshot();
    unsubscribe = state?.subscribe(() => {
      snapshot = state?.getSnapshot();
    });
  };
  attach();
  const stopHost = host.onBindingChange(() => {
    bindingText = host.bindingText;
    density = host.density;
    savedViews = host.savedViews;
    if (host.state !== state) attach();
  });

  return {
    get state() { return state; },
    get snapshot() { return snapshot; },
    get bindingText() { return bindingText; },
    get density() { return density; },
    get savedViews() { return savedViews; },
    stop() {
      stopHost();
      unsubscribe?.();
      unsubscribe = undefined;
    },
  };
}
