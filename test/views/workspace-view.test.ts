// @vitest-environment jsdom
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Density, WorkspaceHost } from '../../src/views/host.ts';
import { en } from '../../src/views/messages.en.ts';
import { ISSUE_VIEW_TYPE, IssueView, WORKSPACE_VIEW_TYPE, WorkspaceView } from '../../src/views/workspace-view.ts';
import type { WorkspaceState } from '../../src/state/workspace-state.ts';
import { App, bridge, type ItemView } from '../support/obsidian.ts';
import { A, B, backend, bean, C, loaded, harness, read } from '../state/support.ts';

/** A host the test drives: bind or unbind a state, change a setting, and see which tabs were requested. */
class FakeHost implements WorkspaceHost {
  state: WorkspaceState | undefined;
  bindingText = 'Checking the Beans project...';
  density: Density = 'comfortable';
  readonly opened: string[] = [];
  private readonly listeners = new Set<() => void>();

  onBindingChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  openIssue(id: string): Promise<void> {
    this.opened.push(id);
    return Promise.resolve();
  }

  change(patch: Partial<Pick<FakeHost, 'state' | 'bindingText' | 'density'>>): void {
    Object.assign(this, patch);
    for (const listener of this.listeners) listener();
  }
}

/**
 * A mutable stand-in for the pane width: Svelte reads `clientWidth` and re-reads it when a ResizeObserver fires.
 * Svelte creates one shared observer for the whole run, so the fake observers are kept across tests.
 */
let paneWidth = 1200;
const resizeObservers: { callback: (entries: { target: Element }[]) => void; targets: Element[] }[] = [];

beforeEach(() => {
  paneWidth = 1200;
  vi.stubGlobal('ResizeObserver', class {
    private readonly record: (typeof resizeObservers)[number];
    constructor(callback: (entries: { target: Element }[]) => void) {
      this.record = { callback, targets: [] };
      resizeObservers.push(this.record);
    }
    observe(target: Element): void {
      this.record.targets.push(target);
    }
    unobserve(): void {}
    disconnect(): void {}
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => paneWidth);
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function resize(width: number): Promise<void> {
  paneWidth = width;
  for (const { callback, targets } of resizeObservers) callback(targets.filter((target) => target.isConnected).map((target) => ({ target })));
  await tick();
}

interface Opened<V> {
  view: V;
  host: FakeHost;
  el: HTMLElement;
  app: App;
  /** Click the button with this exact text. */
  press: (label: string) => Promise<void>;
  button: (label: string) => HTMLButtonElement | undefined;
}

async function open<V extends WorkspaceView | IssueView>(create: new (...args: never[]) => V, state?: Record<string, unknown>, host = new FakeHost()): Promise<Opened<V>> {
  const app = new App();
  app.workspace.viewCreators.set(WORKSPACE_VIEW_TYPE, (leaf) => bridge(new WorkspaceView(bridge(leaf), host)));
  app.workspace.viewCreators.set(ISSUE_VIEW_TYPE, (leaf) => bridge(new IssueView(bridge(leaf), host)));
  const leaf = app.workspace.getLeaf();
  await leaf.setViewState({ type: create === WorkspaceView ? WORKSPACE_VIEW_TYPE : ISSUE_VIEW_TYPE, ...(state && { state }) });
  const view = leaf.view as unknown as V;
  const el = bridge<ItemView>(view).contentEl;
  document.body.append(bridge<ItemView>(view).containerEl);
  const button = (label: string): HTMLButtonElement | undefined =>
    [...el.querySelectorAll('button')].find((candidate) => candidate.textContent.replace(/\s+/g, ' ').trim() === label);
  return {
    view, host, el, app, button,
    press: async (label) => {
      const target = button(label);
      if (!target) throw new Error(`No button "${label}"`);
      target.click();
      await tick();
    },
  };
}

/** The matching rows. Context rows are ancestors drawn for orientation, so they are not rows of the result. */
const rows = (el: HTMLElement): string[] => [...el.querySelectorAll<HTMLElement>('.row:not([data-context])')].map((row) => row.dataset.id ?? '');
const selected = (el: HTMLElement): string | null => el.querySelector('.row[aria-current="true"]')?.getAttribute('data-id') ?? null;
/** Follows a related-bean link in the inspector; the list row of the same bean has the same text. */
async function link(el: HTMLElement, id: string): Promise<void> {
  const target = [...el.querySelectorAll<HTMLButtonElement>('.inspector .link')].find((one) => one.textContent.includes(id));
  if (!target) throw new Error(`No link to ${id}`);
  target.click();
  await tick();
}
const inspectorTitle = (el: HTMLElement): string | undefined => el.querySelector('.inspector h2')?.textContent;

async function bound(beans = [bean(A, { status: 'in-progress', type: 'epic', childIds: [B] }), bean(B, { parentId: A, blockedByIds: [C] }), bean(C, { type: 'milestone' })], extra = {}) {
  const made = await loaded(beans, { readyIds: [C], blockedIds: [B], ...extra });
  const ui = await open(WorkspaceView);
  ui.host.change({ state: made.state });
  await tick();
  return { ...made, ui };
}

describe('workspace view lifecycle', () => {
  it('identifies itself to Obsidian', async () => {
    const { view } = await open(WorkspaceView);

    expect(view.getViewType()).toBe(WORKSPACE_VIEW_TYPE);
    expect(view.getDisplayText()).toBe(en['workspace.title']);
    expect(view.getIcon()).toBe('list-checks');
  });

  it('mounts the workspace once while open and removes it, with its listeners, on close', async () => {
    const { host, el, view } = await open(WorkspaceView);
    const closing = bridge<ItemView>(view);

    await closing.open();
    expect(el.querySelectorAll('section[aria-label]')).toHaveLength(1);
    expect(el.querySelector('section')?.getAttribute('aria-label')).toBe(en['workspace.label']);
    expect(host.listenerCount).toBe(1);

    await closing.close();
    await closing.close();
    expect(el.childElementCount).toBe(0);
    expect(host.listenerCount).toBe(0);
  });

  it('shows why nothing is bound, then follows the binding and a rebind', async () => {
    const { host, el } = await open(WorkspaceView);
    expect(el.querySelector('.unbound')?.textContent).toContain('Checking the Beans project...');

    const first = await loaded([bean(A)]);
    host.change({ state: first.state });
    await tick();
    expect(rows(el)).toEqual([A]);

    const second = await loaded([bean(B)]);
    host.change({ state: second.state });
    await tick();
    expect(rows(el)).toEqual([B]);

    host.change({ state: undefined, bindingText: 'The executable does not exist: /x' });
    await tick();
    expect(el.querySelector('.unbound')?.textContent).toContain('The executable does not exist: /x');
  });

  it('closes only its own tab from the Close button', async () => {
    const { press, app } = await open(WorkspaceView);

    await press(en['action.close']);

    expect(app.workspace.leaves).toHaveLength(0);
  });

  it('applies the density setting', async () => {
    const { host, el } = await open(WorkspaceView);
    expect(el.querySelector('.compact')).toBeNull();

    host.change({ density: 'compact' });
    await tick();

    expect(el.querySelector('.obsibeans-workspace.compact')).not.toBeNull();
  });
});

describe('built-in navigation', () => {
  it('filters by each entry with backend readiness and marks the active one', async () => {
    const { ui } = await bound();
    const shown: Record<string, string[]> = {};
    for (const entry of ['all', 'ready', 'in-progress', 'blocked', 'milestones', 'epics'] as const) {
      await ui.press(en[`nav.${entry}`]);
      shown[entry] = rows(ui.el);
      expect(ui.el.querySelector('[aria-current="page"]')?.textContent.trim()).toBe(en[`nav.${entry}`]);
    }

    expect(shown).toEqual({
      all: [A, C, B],
      ready: [C],
      'in-progress': [A],
      blocked: [B],
      milestones: [C],
      epics: [A],
    });
  });

  it('keeps the selected bean when the navigation entry changes', async () => {
    const { ui } = await bound();
    await ui.press(en['nav.in-progress']);
    ui.el.querySelector<HTMLElement>(`[data-id="${A}"]`)?.click();
    await tick();

    await ui.press(en['nav.milestones']);

    expect(rows(ui.el)).toEqual([C]);
    expect(inspectorTitle(ui.el)).toBe(`Title ${A}`);
  });

  it('saves the layout with the workspace and restores it', async () => {
    const { ui } = await bound();
    await ui.press(en['nav.blocked']);

    expect(ui.app.workspace.layoutSaves).toBe(1);
    const saved = ui.view.getState();
    expect(saved.layout).toMatchObject({ nav: 'blocked' });

    const again = await open(WorkspaceView, saved, ui.host);
    expect(again.el.querySelector('[aria-current="page"]')?.textContent.trim()).toBe(en['nav.blocked']);
  });

  it('falls back to defaults for damaged saved layout and remounts when it is restored', async () => {
    const { view, el } = await open(WorkspaceView, { layout: { nav: 'nope', inspectorWidth: 'wide' } });
    expect(view.getState().layout).toEqual({ nav: 'all', columns: ['id', 'status', 'type', 'priority'], sort: { key: 'default', descending: false }, inspectorWidth: 360 });
    expect(el.querySelectorAll('section[aria-label]')).toHaveLength(1);

    await view.setState({ layout: { nav: 'epics', inspectorWidth: 9999 } }, bridge({}));
    expect(view.getState().layout).toMatchObject({ nav: 'epics', inspectorWidth: 720 });
    expect(el.querySelectorAll('section[aria-label]')).toHaveLength(1);
  });
});

describe('inspector and related-item navigation', () => {
  it('shows the selected bean with both blocker directions as links', async () => {
    const { ui } = await bound();
    ui.el.querySelector<HTMLElement>(`[data-id="${C}"]`)?.click();
    await tick();

    expect(selected(ui.el)).toBe(C);
    const sections = [...ui.el.querySelectorAll('.inspector section')].map((section) => [section.querySelector('h3')?.textContent, section.textContent.replace(/\s+/g, ' ').trim()]);
    expect(sections).toEqual([
      [en['inspector.parent'], `${en['inspector.parent']} ${en['inspector.noneRelated']}`],
      [en['inspector.children'], `${en['inspector.children']} ${en['inspector.noneRelated']}`],
      [en['inspector.blockedBy'], `${en['inspector.blockedBy']} ${en['inspector.noneRelated']}`],
      [en['inspector.blocks'], `${en['inspector.blocks']} ${B} Title ${B}`],
    ]);
  });

  it('follows a link, goes back along the visited path and keeps the list position', async () => {
    const { ui } = await bound();
    const list = ui.el.querySelector<HTMLElement>('.list');
    ui.el.querySelector<HTMLElement>(`[data-id="${B}"]`)?.click();
    await tick();
    if (list) list.scrollTop = 40;
    list?.dispatchEvent(new Event('scroll'));
    expect(ui.button(en['action.back'])).toBeUndefined();

    await link(ui.el, A);
    expect(inspectorTitle(ui.el)).toBe(`Title ${A}`);
    await link(ui.el, B);
    expect(inspectorTitle(ui.el)).toBe(`Title ${B}`);

    await ui.press(en['action.back']);
    expect(inspectorTitle(ui.el)).toBe(`Title ${A}`);
    await ui.press(en['action.back']);
    expect(inspectorTitle(ui.el)).toBe(`Title ${B}`);
    expect(ui.button(en['action.back'])).toBeUndefined();
    expect(list?.scrollTop).toBe(40);
  });

  it('explains a bean that vanished and a link to one that does not exist', async () => {
    const { ui, state, port } = await bound([bean(A, { childIds: ['FX-gone'] }), bean(B)]);
    ui.el.querySelector<HTMLElement>(`[data-id="${A}"]`)?.click();
    await tick();
    expect(ui.el.querySelector('.inspector')?.textContent).toContain('FX-gone (not found)');

    void state.refresh();
    port.lastList.settle({ ok: true, value: read([bean(B)]) });
    await vi.waitFor(() => { expect(ui.el.querySelector('.inspector')?.textContent).toContain(`${A} no longer exists.`); });
  });

  it('opens the bean in its own tab', async () => {
    const { ui } = await bound();
    expect(ui.button(en['action.openTab'])).toBeUndefined();
    ui.el.querySelector<HTMLElement>(`[data-id="${B}"]`)?.click();
    await tick();

    await ui.press(en['action.openTab']);

    expect(ui.host.opened).toEqual([B]);
  });
});

describe('application states', () => {
  it('shows loading, then an empty project', async () => {
    const made = harness();
    const ui = await open(WorkspaceView);
    ui.host.change({ state: made.state });
    await tick();
    expect(ui.el.querySelector('.message')?.textContent).toBe(en['list.loading']);
    expect(ui.el.querySelector('footer')?.textContent).toContain(en['status.loading']);

    void made.state.start();
    made.port.lastList.settle({ ok: true, value: read([]) });
    await vi.waitFor(() => { expect(ui.el.querySelector('.message')?.textContent).toBe(en['list.empty']); });
  });

  it('offers a way back from a view with no matches', async () => {
    const { ui } = await bound([bean(A)], { readyIds: [] });
    await ui.press(en['nav.ready']);
    expect(ui.el.querySelector('.message')?.textContent).toContain(en['list.noMatches']);

    await ui.press(en['list.showAll']);

    expect(rows(ui.el)).toEqual([A]);
  });

  it('shows a disconnected backend with Retry that refreshes', async () => {
    const made = harness();
    const ui = await open(WorkspaceView);
    ui.host.change({ state: made.state });
    void made.state.start();
    made.port.lastList.settle({ ok: false, error: backend('unavailable', 'no process') });
    await vi.waitFor(() => { expect(ui.el.querySelector('[role="alert"]')?.textContent).toContain('Beans failed: no process'); });
    expect(ui.el.querySelector('footer')?.textContent).toContain(en['status.disconnected']);

    await ui.press(en['action.retry']);

    expect(made.port.lists).toHaveLength(2);
  });

  it('lists unusable files as invalid data', async () => {
    const made = harness();
    const ui = await open(WorkspaceView);
    ui.host.change({ state: made.state });
    void made.state.start();
    made.port.lastList.settle({ ok: false, error: backend('invalid-data', 'bad') });
    await vi.waitFor(() => { expect(ui.el.querySelector('.message')).not.toBeNull(); });
    expect(ui.el.querySelector('footer')?.textContent).toContain(en['status.invalid']);
  });

  it('keeps old rows under a stale banner when only the refresh failed, and Refresh retries', async () => {
    const { ui, state, port } = await bound([bean(A)]);

    void state.refresh();
    await tick();
    expect(ui.el.querySelector('footer')?.textContent).toContain(en['status.refreshing']);
    port.lastList.settle({ ok: false, error: backend('timeout', 'slow') });
    await vi.waitFor(() => { expect(ui.el.querySelector('.banner[role="alert"]')?.textContent).toContain('The last refresh failed.'); });

    expect(rows(ui.el)).toEqual([A]);
    expect(ui.el.querySelector('footer')?.textContent).toContain(en['status.stale']);
    await ui.press(en['action.refresh']);
    expect(port.lists.length).toBeGreaterThan(2);
  });

  it('survives two files claiming one ID', async () => {
    const { ui } = await bound([bean(A, { path: 'one.md', tags: ['x', 'x'] }), bean(A, { path: 'two.md' })]);

    expect(rows(ui.el)).toEqual([A, A]);
  });

  it('reports files that were skipped next to usable beans', async () => {
    const { ui } = await bound([bean(A)], { invalid: [{ path: 'x.md', reason: 'name' }] });

    expect(ui.el.querySelector('.banner')?.textContent).toBe('1 file in the task root is not a usable bean and is ignored.');
  });

  it('shows pending, failed and unsaved states with a way to dismiss', async () => {
    const { ui, state, port } = await bound([bean(A)]);

    const writing = state.mutate(A, { kind: 'fields', status: 'completed' });
    await tick();
    expect(ui.el.querySelector('footer')?.textContent).toContain('Saving 1 change...');
    port.mutations[0]?.settle({ ok: false, error: backend('unavailable', 'gone') });
    await writing;
    await tick();
    expect(ui.el.querySelector('footer .problem')?.textContent).toContain(`${A}: Not saved. Beans failed: gone`);

    await ui.press(en['action.dismiss']);
    expect(ui.el.querySelector('footer .problem')).toBeNull();
    expect(ui.el.querySelector('footer')?.textContent).toContain(en['save.saved']);

    state.setDraft('description', A, 'text', 'rev');
    await tick();
    expect(ui.el.querySelector('footer')?.textContent).toContain('1 unsaved draft');
  });
});

describe('narrow panes', () => {
  it('stacks list and details with Back, and hides navigation behind Views', async () => {
    paneWidth = 500;
    const { ui } = await bound();
    await resize(500);
    expect(ui.el.querySelector('.narrow')).not.toBeNull();
    expect(ui.el.querySelector('nav')).toBeNull();
    expect(ui.el.querySelector('.splitter')).toBeNull();

    await ui.press(en['action.views']);
    expect(ui.el.querySelector('nav')).not.toBeNull();
    await ui.press(en['nav.epics']);
    expect(rows(ui.el)).toEqual([A]);
    expect(ui.el.querySelector('nav')).toBeNull();

    ui.el.querySelector<HTMLElement>(`[data-id="${A}"]`)?.click();
    await tick();
    expect(ui.el.querySelector('.pane-list')?.hasAttribute('hidden')).toBe(true);
    expect(inspectorTitle(ui.el)).toBe(`Title ${A}`);

    await ui.press(en['action.back']);
    expect(ui.el.querySelector('.pane-list')?.hasAttribute('hidden')).toBe(false);
    expect(ui.el.querySelector('.inspector')).toBeNull();
    expect(selected(ui.el)).toBe(A);
  });

  it('returns focus to the row that was open and puts the scroll position back', async () => {
    paneWidth = 500;
    const { ui } = await bound();
    await resize(500);
    const list = ui.el.querySelector<HTMLElement>('.list');
    const row = ui.el.querySelector<HTMLElement>(`[data-id="${B}"]`);
    row?.focus();
    if (list) list.scrollTop = 25;
    list?.dispatchEvent(new Event('scroll'));
    row?.click();
    await tick();
    if (list) list.scrollTop = 0;

    await ui.press(en['action.back']);
    await tick();

    expect(list?.scrollTop).toBe(25);
    expect(document.activeElement).toBe(ui.el.querySelector(`[data-id="${B}"]`));
  });

  it('widens back out to three panes', async () => {
    paneWidth = 500;
    const { ui } = await bound();
    await resize(500);
    await resize(1200);

    expect(ui.el.querySelector('.narrow')).toBeNull();
    expect(ui.el.querySelector('nav')).not.toBeNull();
    expect(ui.el.querySelector('.splitter')).not.toBeNull();
  });
});

describe('resizable inspector', () => {
  it('resizes from the keyboard within bounds and saves it', async () => {
    const { ui } = await bound();
    const splitter = ui.el.querySelector<HTMLElement>('.splitter');
    expect(splitter?.getAttribute('aria-valuenow')).toBe('360');

    for (let press = 0; press < 3; press++) splitter?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    await tick();
    expect(splitter?.getAttribute('aria-valuenow')).toBe('408');
    for (let press = 0; press < 100; press++) splitter?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await tick();
    expect(splitter?.getAttribute('aria-valuenow')).toBe('240');
    splitter?.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    expect(ui.view.getState().layout).toMatchObject({ inspectorWidth: 240 });
  });

  it('resizes by dragging and saves once the drag ends', async () => {
    const { ui } = await bound();
    const splitter = ui.el.querySelector<HTMLElement>('.splitter');
    if (splitter) splitter.setPointerCapture = () => undefined;
    const pointer = (type: string, clientX: number): void => {
      const event = new Event(type, { bubbles: true }) as Event & { clientX: number; pointerId: number };
      event.clientX = clientX;
      event.pointerId = 1;
      splitter?.dispatchEvent(event);
    };

    pointer('pointerdown', 800);
    pointer('pointermove', 700);
    await tick();
    expect(splitter?.getAttribute('aria-valuenow')).toBe('460');
    expect(ui.app.workspace.layoutSaves).toBe(0);
    pointer('pointerup', 700);
    pointer('pointermove', 100);
    await tick();

    expect(ui.app.workspace.layoutSaves).toBe(1);
    expect(splitter?.getAttribute('aria-valuenow')).toBe('460');
  });
});

describe('issue tab', () => {
  it('opens one bean, follows links with Back, and releases its listeners on close', async () => {
    const made = await loaded([bean(A, { childIds: [B] }), bean(B, { parentId: A })]);
    const host = new FakeHost();
    host.state = made.state;
    const ui = await open(IssueView, { id: A }, host);

    expect(ui.view.getViewType()).toBe(ISSUE_VIEW_TYPE);
    expect(ui.view.getDisplayText()).toBe(A);
    expect(ui.view.getState()).toMatchObject({ id: A });
    expect(inspectorTitle(ui.el)).toBe(`Title ${A}`);
    expect(ui.el.querySelector('section')?.getAttribute('aria-label')).toBe(`Bean ${A}`);
    expect(ui.button(en['action.openTab'])).toBeUndefined();

    await ui.press(`${B} Title ${B}`);
    expect(inspectorTitle(ui.el)).toBe(`Title ${B}`);
    await ui.press(en['action.back']);
    expect(inspectorTitle(ui.el)).toBe(`Title ${A}`);
    expect(ui.view.getState()).toMatchObject({ id: A });

    await ui.press(en['action.refresh']);
    await ui.press(en['action.close']);
    expect(ui.app.workspace.leaves).toHaveLength(0);
    await bridge<ItemView>(ui.view).close();
    expect(host.listenerCount).toBe(0);
  });

  it('switches bean when restored with other state, and names itself before it has one', async () => {
    const made = await loaded([bean(A), bean(B)]);
    const host = new FakeHost();
    host.state = made.state;
    const ui = await open(IssueView, undefined, host);
    expect(ui.view.getDisplayText()).toBe(en['issue.title']);

    await ui.view.setState({ id: B }, bridge({}));
    expect(inspectorTitle(ui.el)).toBe(`Title ${B}`);
    await ui.view.setState({ id: B }, bridge({}));
    await ui.view.setState({ id: 7 }, bridge({}));
    expect(ui.view.beanId).toBe('');
  });

  it('shows why nothing is bound', async () => {
    const ui = await open(IssueView, { id: A });

    expect(ui.el.querySelector('.unbound')?.textContent).toContain('Checking the Beans project...');
  });
});
