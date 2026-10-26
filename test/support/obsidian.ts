/**
 * Headless stand-in for the `obsidian` module, which has no runtime outside the app. vite.config.ts aliases
 * `obsidian` to this file for tests. It implements only the API surface the plugin uses; the native smoke
 * test (test/native/smoke.ts) exercises the real API.
 */

/**
 * Bridges compile-time types between this stub and the real `obsidian` declarations. Safe because the test
 * alias makes these classes the runtime implementation that production code receives.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- a deliberate, documented cast point
export function bridge<T>(value: unknown): T {
  return value as T;
}

export interface Command {
  readonly id: string;
  readonly name: string;
  readonly callback?: () => unknown;
  readonly checkCallback?: (checking: boolean) => boolean;
}

export abstract class View {
  readonly leaf: WorkspaceLeaf;
  readonly app: { readonly workspace: Workspace };
  readonly containerEl = document.createElement('div');

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.app = { workspace: leaf.workspace };
  }

  abstract getViewType(): string;

  getState(): Record<string, unknown> {
    return {};
  }

  /** The state Obsidian last restored this view with. */
  restored: unknown;

  setState(state: unknown, result: object): Promise<void> {
    this.restored = { state, result };
    return Promise.resolve();
  }

  protected onOpen(): Promise<void> {
    return Promise.resolve();
  }

  protected onClose(): Promise<void> {
    return Promise.resolve();
  }

  /** Test hook: Obsidian calls the protected lifecycle methods itself. */
  open(): Promise<void> {
    return this.onOpen();
  }

  close(): Promise<void> {
    return this.onClose();
  }
}

export abstract class ItemView extends View {
  readonly contentEl = this.containerEl.appendChild(document.createElement('div'));
}

export class WorkspaceLeaf {
  view: View | undefined;
  readonly workspace: Workspace;

  constructor(workspace: Workspace) {
    this.workspace = workspace;
  }

  async setViewState(state: { type: string; state?: unknown }): Promise<void> {
    const create = this.workspace.viewCreators.get(state.type);
    if (!create) throw new Error(`Unknown view type ${state.type}`);
    await this.view?.close();
    this.view = create(this);
    await this.view.open();
    await this.view.setState(state.state ?? {}, {});
  }

  async detach(): Promise<void> {
    await this.view?.close();
    this.view = undefined;
    this.workspace.leaves.splice(this.workspace.leaves.indexOf(this), 1);
  }
}

export class Workspace {
  readonly viewCreators = new Map<string, (leaf: WorkspaceLeaf) => View>();
  readonly leaves: WorkspaceLeaf[] = [];
  readonly revealed: WorkspaceLeaf[] = [];
  /** Test hook: the leaf `getActiveViewOfType` reports. */
  activeLeaf: WorkspaceLeaf | undefined;
  layoutSaves = 0;

  requestSaveLayout(): void {
    this.layoutSaves++;
  }

  getActiveViewOfType(): View | null {
    return this.activeLeaf?.view ?? null;
  }

  getLeavesOfType(type: string): WorkspaceLeaf[] {
    return this.leaves.filter((leaf) => leaf.view?.getViewType() === type);
  }

  getLeaf(): WorkspaceLeaf {
    const leaf = new WorkspaceLeaf(this);
    this.leaves.push(leaf);
    return leaf;
  }

  revealLeaf(leaf: WorkspaceLeaf): Promise<void> {
    this.revealed.push(leaf);
    return Promise.resolve();
  }
}

/** Records the icon instead of drawing it. */
export function setIcon(parent: HTMLElement, iconId: string): void {
  parent.dataset.icon = iconId;
}

export class FileSystemAdapter {
  private readonly base: string;

  constructor(base: string) {
    this.base = base;
  }

  getBasePath(): string {
    return this.base;
  }
}

/** A vault file or folder, reduced to what the plugin reads. */
export interface Entry {
  readonly path: string;
}

export interface EventRef {
  readonly name: string;
  readonly callback: (...args: never[]) => unknown;
}

export class Vault {
  adapter: unknown;
  private readonly refs = new Set<EventRef>();

  constructor(adapter: unknown) {
    this.adapter = adapter;
  }

  on(name: string, callback: (...args: never[]) => unknown): EventRef {
    const ref = { name, callback };
    this.refs.add(ref);
    return ref;
  }

  offref(ref: EventRef): void {
    this.refs.delete(ref);
  }

  /** Test hook: what Obsidian does when a file changes. */
  trigger(name: string, ...args: unknown[]): void {
    for (const ref of [...this.refs]) if (ref.name === name) (ref.callback as (...values: unknown[]) => unknown)(...args);
  }

  get listenerCount(): number {
    return this.refs.size;
  }
}

export class App {
  readonly workspace = new Workspace();
  readonly vault: Vault;

  constructor(vaultRoot?: string) {
    this.vault = new Vault(vaultRoot === undefined ? {} : new FileSystemAdapter(vaultRoot));
  }
}

/** Parses the one shape tests need: nested `key: value` maps with 4-space indentation and no quoting. */
export function parseYaml(text: string): unknown {
  const root: Record<string, unknown> = {};
  let section: Record<string, unknown> | undefined;
  for (const line of text.split('\n')) {
    const match = /^( *)([\w.]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, indent = '', key = '', raw = ''] = match;
    const value: unknown = raw === '' ? undefined : /^\d+$/.test(raw) ? Number(raw) : raw;
    if (indent === '') {
      section = value === undefined ? {} : undefined;
      root[key] = value ?? section;
    } else if (section) section[key] = value;
  }
  return root;
}

export class Plugin {
  readonly app: App;
  readonly commands: Command[] = [];
  readonly settingTabs: PluginSettingTab[] = [];
  /** What `loadData()` returns, and the last value passed to `saveData()`. */
  data: unknown;

  constructor(app: App) {
    this.app = app;
  }

  registerView(type: string, create: (leaf: WorkspaceLeaf) => View): void {
    this.app.workspace.viewCreators.set(type, create);
  }

  loadData(): Promise<unknown> {
    return Promise.resolve(this.data);
  }

  saveData(data: unknown): Promise<void> {
    this.data = structuredClone(data);
    return Promise.resolve();
  }

  readonly ribbon: { readonly icon: string; readonly title: string; readonly callback: () => unknown }[] = [];

  addRibbonIcon(icon: string, title: string, callback: () => unknown): HTMLElement {
    this.ribbon.push({ icon, title, callback });
    return document.createElement('div');
  }

  addCommand(command: Command): Command {
    this.commands.push(command);
    return command;
  }

  addSettingTab(tab: PluginSettingTab): void {
    this.settingTabs.push(tab);
  }

  /** Obsidian detaches registered events when the plugin unloads. */
  private readonly registered: EventRef[] = [];

  registerEvent(ref: EventRef): void {
    this.registered.push(ref);
  }

  /** Test hook: unload as Obsidian does, running `onunload` and then detaching registered events. */
  unload(): void {
    (this as unknown as { onunload?: () => void }).onunload?.();
    for (const ref of this.registered.splice(0)) this.app.vault.offref(ref);
  }
}

export class PluginSettingTab {
  readonly app: App;
  readonly plugin: Plugin;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
  }
}
