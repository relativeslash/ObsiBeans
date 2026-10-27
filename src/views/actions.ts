/**
 * Every keyboard-reachable action of a Beans view. Each one is a palette command (`command.<id>`) and, where a
 * key is listed below, a shortcut. Visible controls call the same code, so the three ways cannot drift apart.
 */
export const ACTIONS = [
  'new', 'search', 'tags', 'copy', 'selectAll', 'clearSelection', 'viewList', 'viewBoard', 'viewHierarchy',
  'status', 'type', 'priority', 'parent', 'blocks', 'edit', 'openSource', 'copyLink', 'back', 'help',
] as const;
export type ActionId = (typeof ACTIONS)[number];

/** Acts on the work list, board or hierarchy. */
export const LIST_ACTIONS: readonly ActionId[] = ['new', 'search', 'tags', 'copy', 'selectAll', 'clearSelection', 'viewList', 'viewBoard', 'viewHierarchy'];
/** Acts on the bean the inspector shows. An issue tab is only the inspector, so it offers these plus `back` and `help`. */
export const DETAIL_ACTIONS: readonly ActionId[] = ['copy', 'status', 'type', 'priority', 'parent', 'blocks', 'edit', 'openSource', 'copyLink'];

/** Familiar bindings (design: TUI parity) for the list pane and the inspector. They never act inside text fields. */
export const LIST_KEYS: Readonly<Record<string, ActionId>> = { '/': 'search', y: 'copy', c: 'new', '?': 'help' };
export const DETAIL_KEYS: Readonly<Record<string, ActionId>> = { s: 'status', t: 'type', P: 'priority', p: 'parent', b: 'blocks', e: 'edit', y: 'copy', '?': 'help' };

/** What a mounted view offers to palette commands. A view sets `run` while mounted and clears it when it goes. */
export interface ActionPort {
  run?: ((action: ActionId) => void) | undefined;
}

/** Typing in a field, or choosing from a picker, owns the keys: no shortcut may fire there. Checkboxes do not type. */
export const isText = (target: HTMLElement): boolean => target.matches('input:not([type="checkbox"]), select, textarea') || target.isContentEditable;
