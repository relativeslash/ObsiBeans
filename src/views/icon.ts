import { setIcon } from 'obsidian';
import type { Action } from 'svelte/action';

/** Svelte action: draws an Obsidian icon. Icons are decorative; the control keeps its text label. */
export const icon: Action<HTMLElement, string> = (node, name) => {
  setIcon(node, name);
  node.setAttribute('aria-hidden', 'true');
  return {
    update(next) {
      setIcon(node, next);
    },
  };
};
