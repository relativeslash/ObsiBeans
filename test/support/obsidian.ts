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

  /** Test hook: the files opened in this leaf. */
  readonly opened: Entry[] = [];

  openFile(file: Entry): Promise<void> {
    this.opened.push(file);
    return Promise.resolve();
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

  /** Test hook: the handlers registered with `on`, by event name. */
  readonly handlers: EventRef[] = [];

  on(name: string, callback: (...args: never[]) => unknown): EventRef {
    const ref = { name, callback };
    this.handlers.push(ref);
    return ref;
  }

  getLeaf(): WorkspaceLeaf {
    const leaf = new WorkspaceLeaf(this);
    this.leaves.push(leaf);
    return leaf;
  }

  getRightLeaf(): WorkspaceLeaf | null {
    return this.getLeaf();
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
  /** Test hook: the vault paths that exist. */
  readonly files = new Set<string>();
  private readonly refs = new Set<EventRef>();

  constructor(adapter: unknown) {
    this.adapter = adapter;
  }

  getFileByPath(path: string): Entry | null {
    return this.files.has(path) ? { path } : null;
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

export class FileManager {
  /** Test hook: the `sourcePath` of every call. */
  readonly sources: string[] = [];

  generateMarkdownLink(file: Entry, sourcePath: string, _subpath?: string, alias?: string): string {
    this.sources.push(sourcePath);
    return `[[${file.path}${alias === undefined ? '' : `|${alias}`}]]`;
  }
}

/** Only the part of the metadata cache the plugin reads, and a hook to raise its event. */
export class MetadataCache {
  /** Test hook: what Obsidian resolved, by source path and then target path. */
  resolvedLinks: Record<string, Record<string, number>> = {};
  private readonly refs = new Set<EventRef>();

  on(name: string, callback: (...args: never[]) => unknown): EventRef {
    const ref = { name, callback };
    this.refs.add(ref);
    return ref;
  }

  trigger(name: string): void {
    for (const ref of [...this.refs]) if (ref.name === name) ref.callback();
  }
}

/** A modal that opens and closes synchronously and draws into `contentEl`. */
export class Modal {
  readonly app: App;
  readonly contentEl = document.createElement('div');
  isOpen = false;

  constructor(app: App) {
    this.app = app;
  }

  onOpen(): void {}
  onClose(): void {}

  open(): void {
    this.isOpen = true;
    this.onOpen();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.onClose();
  }
}

/** Lifecycle owner of rendered content. */
export class Component {
  loaded = false;
  load(): void {
    this.loaded = true;
  }

  unload(): void {
    this.loaded = false;
  }
}

export const MarkdownRenderer = {
  /** Test hook: what the last call received. Writes the Markdown as text, with one task checkbox per `- [ ]` line. */
  calls: [] as { markdown: string; sourcePath: string; component: Component }[],
  fail: false,
  render(_app: unknown, markdown: string, el: HTMLElement, sourcePath: string, component: Component): Promise<void> {
    MarkdownRenderer.calls.push({ markdown, sourcePath, component });
    if (MarkdownRenderer.fail) return Promise.reject(new Error('render failed'));
    el.textContent = markdown;
    for (let count = markdown.match(/^\s*- \[[ x]\]/gm)?.length ?? 0; count > 0; count--) {
      const box = document.createElement('input');
      box.type = 'checkbox';
      el.append(box);
    }
    return Promise.resolve();
  },
};

export class App {
  readonly workspace = new Workspace();
  readonly fileManager = new FileManager();
  readonly metadataCache = new MetadataCache();
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
