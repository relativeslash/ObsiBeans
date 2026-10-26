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
}

export abstract class View {
  readonly leaf: WorkspaceLeaf;
  readonly containerEl = document.createElement('div');

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
  }

  abstract getViewType(): string;

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
  private readonly workspace: Workspace;

  constructor(workspace: Workspace) {
    this.workspace = workspace;
  }

  async setViewState(state: { type: string }): Promise<void> {
    const create = this.workspace.viewCreators.get(state.type);
    if (!create) throw new Error(`Unknown view type ${state.type}`);
    await this.view?.close();
    this.view = create(this);
    await this.view.open();
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

export class FileSystemAdapter {
  private readonly base: string;

  constructor(base: string) {
    this.base = base;
  }

  getBasePath(): string {
    return this.base;
  }
}

export class Vault {
  adapter: unknown;

  constructor(adapter: unknown) {
    this.adapter = adapter;
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

  addCommand(command: Command): Command {
    this.commands.push(command);
    return command;
  }

  addSettingTab(tab: PluginSettingTab): void {
    this.settingTabs.push(tab);
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
