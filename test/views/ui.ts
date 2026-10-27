import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, vi } from 'vitest';
import type { AdapterError, Draft } from '../../src/state/model.ts';
import type { WorkspaceState } from '../../src/state/workspace-state.ts';
import type { WorkspaceHost } from '../../src/views/host.ts';
import { DEFAULT_LAYOUT } from '../../src/views/layout.ts';
import Workspace from '../../src/views/Workspace.svelte';
import { A, B, bean, detail, type Harness } from '../state/support.ts';

export const mounts: ReturnType<typeof mount>[] = [];
export const writeText = vi.fn<(text: string) => Promise<void>>();
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => {
  for (const one of mounts.splice(0)) void unmount(one);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A host that draws Markdown as text and records what the inspector asked of Obsidian. */
export class TestHost implements WorkspaceHost {
  state: WorkspaceState;
  bindingText = '';
  density = 'comfortable' as const;
  sourceFound = true;
  link: string | undefined = '[[FX-aaaaa--x]]';
  readonly sources: string[] = [];
  readonly released: string[] = [];

  constructor(state: WorkspaceState) {
    this.state = state;
  }

  onBindingChange = (): (() => void) => () => undefined;
  openIssue = (): Promise<void> => Promise.resolve();

  renderMarkdown(markdown: string, el: HTMLElement, id: string): () => void {
    el.textContent = markdown;
    return () => { this.released.push(id); };
  }

  openSource(id: string): Promise<boolean> {
    this.sources.push(id);
    return Promise.resolve(this.sourceFound);
  }

  sourceLink(): string | undefined {
    return this.link;
  }
}

export const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await tick();
};

export const beans = () => [bean(A, { title: 'Alpha', tags: ['ui'] }), bean(B, { title: 'Beta' })];
export const stored = (extra: Partial<Draft> = {}): Draft => ({ kind: 'description', key: A, text: 'Draft text', revision: `rev-${A}`, savedAt: '2026-10-26T20:00:00Z', ...extra });

export async function open(made: Harness) {
  const host = new TestHost(made.state);
  const el = document.body.appendChild(document.createElement('div'));
  mounts.push(mount(Workspace, { target: el, props: { host, layout: DEFAULT_LAYOUT, onLayout: () => undefined, onClose: () => undefined } }));
  await tick();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the element type it expects
  const q = <T extends HTMLElement>(selector: string): T => {
    const found = el.querySelector<T>(selector);
    if (!found) throw new Error(`Nothing matches ${selector}`);
    return found;
  };
  const buttonIn = (scope: string, label: string): HTMLButtonElement => {
    const found = [...q(scope).querySelectorAll('button')].find((one) => one.textContent.replace(/\s+/g, ' ').trim() === label);
    if (!found) throw new Error(`No button "${label}" in ${scope}`);
    return found;
  };
  const ui = {
    el, host, port: made.port, state: made.state, q, buttonIn,
    /** Buttons of the details pane. */
    press: async (label: string): Promise<void> => { buttonIn('.pane-detail', label).click(); await settle(); },
    toolbar: async (label: string): Promise<void> => { buttonIn('.toolbar', label).click(); await settle(); },
    text: async (target: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> => {
      target.value = value;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      await tick();
    },
    choose: async (target: HTMLSelectElement, value: string): Promise<void> => {
      target.value = value;
      target.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    },
    key: (target: Element, key: string): void => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); },
    /** Selects a bean in the list and answers its description read. */
    show: async (id: string, extra: Parameters<typeof detail>[1] = {}): Promise<void> => {
      q<HTMLElement>(`button.row[data-id="${id}"]`).click();
      await settle();
      made.port.gets.at(-1)?.settle({ ok: true, value: detail(id, extra) });
      await settle();
    },
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the element type it expects
    field: <T extends HTMLElement>(name: string, id = A): T => q<T>(`#field-${name}-${id}`),
    answer: async (index: number, outcome: Parameters<Harness['port']['mutations'][number]['settle']>[0]): Promise<void> => {
      made.port.mutations[index]?.settle(outcome);
      await settle();
    },
    drafts: () => made.state.getSnapshot().drafts.map((entry) => entry.draft.text),
  };
  return ui;
}

export const conflict = (current: ReturnType<typeof detail> | null, code: 'revision' | 'body' = 'revision'): { ok: false; error: AdapterError } => ({ ok: false, error: { kind: 'conflict', code, current } });
export const rejected = (message: string): { ok: false; error: AdapterError } => ({ ok: false, error: { kind: 'validation', code: 'backend', message } });

