import { Component, FileSystemAdapter, ItemView, MarkdownRenderer, parseYaml, Plugin, type TFile } from 'obsidian';
import type { BeansContext } from '../adapter/beans-graphql.ts';
import { PRIORITIES, STATUSES, TYPES } from '../adapter/beans-model.ts';
import { getBean, listBeans } from '../adapter/beans-read.ts';
import { createBean, mutateBean } from '../adapter/beans-write.ts';
import { bindProject, configUnchanged, confirmExecutable, type Binding } from '../adapter/binding.ts';
import { ProcessRunner } from '../adapter/process.ts';
import { parseDrafts } from '../state/drafts.ts';
import type { BeansPort, Draft } from '../state/model.ts';
import { applyViewChange, loadViews, SCHEMA_VERSION, serializeViews, type ViewChange, type ViewEntry, type ViewResult } from '../state/saved-views.ts';
import { WorkspaceState } from '../state/workspace-state.ts';
import { t } from '../views/i18n.ts';
import type { Density, RelatedNote, WorkspaceHost } from '../views/host.ts';
import { ISSUE_VIEW_TYPE, IssueView, SIDEBAR_VIEW_TYPE, SidebarView, WORKSPACE_VIEW_TYPE, WorkspaceView } from '../views/workspace-view.ts';
import { NoteActions } from './notes.ts';
import { parseSettings, type BindingState, type ObsiBeansSettings, type SettingsHost } from './settings.ts';
import { describeBinding, ObsiBeansSettingTab } from './settings-tab.ts';

/** Plugin shell. Everything registered here is released by Obsidian when the plugin unloads. */
export default class ObsiBeansPlugin extends Plugin implements SettingsHost, WorkspaceHost {
  override settings: ObsiBeansSettings = parseSettings(undefined);
  binding: BindingState;
  /** Owns every Beans process of this session. */
  readonly runner = new ProcessRunner();
  /** The shared state of the bound project; replaced on every rebind. Views follow it through `onBindingChange`. */
  state: WorkspaceState | undefined;
  private generation = 0;
  private readonly listeners = new Set<() => void>();
  savedViews: readonly ViewEntry[] = [];
  private schemaVersion = SCHEMA_VERSION;
  private drafts: readonly Draft[] = [];
  private writes: Promise<unknown> = Promise.resolve();
  private readonly notes = new NoteActions(this.app, {
    host: this,
    taskRoot: () => (this.binding?.ok ? this.binding.value.taskRootInVault : undefined),
    fileOf: (id) => this.sourceFile(id),
  });

  override async onload(): Promise<void> {
    const stored = await this.loadData() as unknown;
    this.settings = parseSettings(stored);
    this.drafts = parseDrafts(typeof stored === 'object' && stored !== null && 'drafts' in stored ? stored.drafts : undefined);
    const views = loadViews(stored);
    this.savedViews = views.entries;
    this.schemaVersion = views.schemaVersion;
    this.registerView(WORKSPACE_VIEW_TYPE, (leaf) => new WorkspaceView(leaf, this));
    this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new SidebarView(leaf, this));
    this.registerView(ISSUE_VIEW_TYPE, (leaf) => new IssueView(leaf, this));
    this.addRibbonIcon('list-checks', t('command.openWorkspace'), () => void this.openWorkspace());
    this.addCommand({ id: 'open-workspace', name: t('command.openWorkspace'), callback: () => this.openWorkspace() });
    this.addCommand({ id: 'open-sidebar', name: t('command.openSidebar'), callback: () => this.openSidebar() });
    this.addCommand({ id: 'refresh', name: t('command.refresh'), callback: () => void this.state?.refresh() });
    this.addCommand({ id: 'close-view', name: t('command.closeView'), checkCallback: (checking) => this.closeActiveView(checking) });
    this.addCommand({ id: 'insert-link', name: t('command.insertLink'), editorCheckCallback: (checking, editor, context) => this.notes.insertLink(checking, editor, context) });
    this.addCommand({ id: 'convert-selection', name: t('command.convertSelection'), editorCheckCallback: (checking, editor, context) => this.notes.convertSelection(checking, editor, context) });
    const { vault, workspace, metadataCache } = this.app;
    this.registerEvent(workspace.on('editor-menu', (menu, editor, context) => { this.notes.addMenuItems(menu, editor, context); }));
    // Obsidian resolves links in the background; open inspectors read them again when it is done.
    this.registerEvent(metadataCache.on('resolved', () => { this.publish(); }));
    this.registerEvent(vault.on('create', (file) => { this.vaultChanged(file.path); }));
    this.registerEvent(vault.on('modify', (file) => { this.vaultChanged(file.path); }));
    this.registerEvent(vault.on('delete', (file) => { this.vaultChanged(file.path); }));
    this.registerEvent(vault.on('rename', (file, oldPath) => { this.vaultChanged(file.path, oldPath); }));
    this.addSettingTab(new ObsiBeansSettingTab(this.app, this, this));
    void this.rebind();
  }

  override onunload(): void {
    this.generation++;
    this.listeners.clear();
    void this.state?.dispose();
    this.state = undefined;
    void this.runner.dispose();
  }

  /**
   * Routes a vault event. A change to the bound config can change the prefix or task root, so it rebinds;
   * a change under the task root refreshes the project after a debounce.
   * ponytail: Obsidian does not index dot-files, so events for `.beans.yml` normally never arrive; every refresh
   * checks the config content instead (`portFor`), so a config change is noticed at the next refresh, not at once.
   */
  private vaultChanged(path: string, oldPath?: string): void {
    const config = this.binding?.ok ? this.binding.value.configInVault : undefined;
    if (config !== undefined && (path === config || oldPath === config)) void this.rebind();
    else this.state?.vaultChanged(path, oldPath);
  }

  /** Calls `listener` whenever `binding` changes. Returns the function that stops it. */
  onBindingChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private publish(): void {
    for (const listener of this.listeners) listener();
  }

  get bindingText(): string {
    return describeBinding(this.binding);
  }

  get density(): Density {
    return this.settings.density;
  }

  async saveSettings(): Promise<void> {
    await this.persist();
    this.publish();
  }

  /**
   * Applies one saved-view change and stores it. Views are plugin data only; no bean file is read or written.
   * A failed write restores the previous list (unless a later change already replaced it) and reports `storage`.
   */
  async changeViews(change: ViewChange): Promise<ViewResult> {
    const before = this.savedViews;
    const result = applyViewChange(before, change, crypto.randomUUID());
    if (!result.ok) return result;
    this.savedViews = result.entries;
    this.publish();
    try {
      await this.persist();
    } catch (error) {
      console.error('ObsiBeans: saving the views failed', error);
      if (this.savedViews === result.entries) this.savedViews = before;
      this.publish();
      return { ok: false, reason: 'storage' };
    }
    return result;
  }

  /** Settings, saved views and drafts share one data file, so every write carries all of them and writes never overlap. */
  private persist(): Promise<void> {
    const write = this.writes
      .catch(() => undefined)
      .then(() => this.saveData({ ...this.settings, schemaVersion: this.schemaVersion, savedViews: serializeViews(this.savedViews), drafts: this.drafts }));
    this.writes = write;
    return write;
  }

  private portFor(binding: Binding): BeansPort {
    const context = (signal?: AbortSignal): BeansContext => ({ runner: this.runner, binding, parseYaml, ...(signal && { signal }) });
    return {
      list: async (signal) => {
        // Beans reads the config fresh on every call, but the binding (prefix, task root, defaults) was made from the old one.
        if (await configUnchanged(binding)) return listBeans(context(signal));
        void this.rebind();
        return { ok: false, error: { kind: 'backend', code: 'cancelled', message: 'The project configuration changed.' } };
      },
      get: (id) => getBean(context(), id),
      mutate: (id, revision, change) => mutateBean(context(), id, revision, change),
      create: (bean) => createBean(context(), bean),
    };
  }

  private startState(binding: Binding): WorkspaceState {
    const state = new WorkspaceState({
      port: this.portFor(binding),
      vocabulary: { statuses: STATUSES, types: TYPES, priorities: PRIORITIES },
      defaults: { ...binding.defaults, priority: 'normal' },
      taskRoot: binding.taskRootInVault,
      drafts: this.drafts,
      saveDrafts: (drafts) => {
        this.drafts = drafts;
        return this.persist();
      },
      now: Date.now,
    });
    state.start().catch((error: unknown) => {
      console.error('ObsiBeans: loading the project failed unexpectedly', error);
    });
    return state;
  }

  /** Rechecks the bound project. Cancels running Beans calls, and a superseded check never overwrites a newer one. */
  async rebind(): Promise<void> {
    const generation = ++this.generation;
    const previous = this.state;
    this.state = undefined;
    this.binding = undefined;
    this.publish();
    const disposing = previous?.dispose();
    this.runner.cancelAll();
    // Disposing writes pending drafts, so the next state must start after it.
    await disposing;
    const vaultRoot = this.vaultRoot();
    const result = vaultRoot === undefined
      ? { ok: false as const, diagnostic: { code: 'vault-not-local' as const } }
      : await bindProject({ ...this.settings, vaultRoot, parseYaml, runner: this.runner });
    if (generation === this.generation) {
      this.binding = result;
      if (result.ok) this.state = this.startState(result.value);
      this.publish();
    }
  }

  /** The user's explicit trust step for the entered executable. */
  async confirmExecutable(): Promise<void> {
    const vaultRoot = this.vaultRoot();
    if (vaultRoot !== undefined) {
      const result = await confirmExecutable(this.settings.executable, vaultRoot);
      if (result.ok) {
        this.settings.confirmedExecutable = result.value.path;
        this.settings.confirmedDigest = result.value.sha256;
        await this.saveSettings();
      }
    }
    await this.rebind();
  }

  private vaultRoot(): string | undefined {
    const { adapter } = this.app.vault;
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : undefined;
  }

  /** Closes the active Beans tab only, never Obsidian. Offered only while one is active. */
  private closeActiveView(checking: boolean): boolean {
    const { workspace } = this.app;
    const leaf = workspace.getActiveViewOfType(ItemView)?.leaf;
    const type = leaf?.view.getViewType();
    if (!leaf || (type !== WORKSPACE_VIEW_TYPE && type !== ISSUE_VIEW_TYPE)) return false;
    if (!checking) leaf.detach();
    return true;
  }

  /** Opens the bean in its own tab. A bean that already has a tab is revealed instead of duplicated. */
  async openIssue(id: string): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(ISSUE_VIEW_TYPE).find((one) => one.view instanceof IssueView && one.view.beanId === id);
    if (!leaf) {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: ISSUE_VIEW_TYPE, state: { id }, active: true });
    }
    await workspace.revealLeaf(leaf);
  }

  /** The bean's Markdown file, found by the path the project last listed for its full ID. */
  private sourceFile(id: string): TFile | null {
    const bean = this.state?.getSnapshot().beans.find((one) => one.id === id);
    const root = this.binding?.ok ? this.binding.value.taskRootInVault : undefined;
    return bean === undefined || root === undefined ? null : this.app.vault.getFileByPath(root === '' ? bean.path : `${root}/${bean.path}`);
  }

  async openSource(id: string): Promise<boolean> {
    const file = this.sourceFile(id);
    if (file) await this.app.workspace.getLeaf('tab').openFile(file);
    return file !== null;
  }

  sourceLink(id: string): string | undefined {
    const file = this.sourceFile(id);
    return file ? this.app.fileManager.generateMarkdownLink(file, '') : undefined;
  }

  relatedNotes(id: string): readonly RelatedNote[] {
    return this.notes.related(id);
  }

  openNote(path: string): Promise<boolean> {
    return this.notes.openNote(path);
  }

  renderMarkdown(markdown: string, el: HTMLElement, id: string): () => void {
    const component = new Component();
    component.load();
    const readOnly = (): void => {
      for (const box of el.querySelectorAll('input[type="checkbox"]')) (box as HTMLInputElement).disabled = true;
    };
    MarkdownRenderer.render(this.app, markdown, el, this.sourceFile(id)?.path ?? '', component).then(readOnly, () => {
      el.textContent = markdown;
    });
    return () => { component.unload(); };
  }

  /** Reveals the compact Ready / In progress sidebar, or opens it in the right sidebar. */
  async openSidebar(): Promise<void> {
    const { workspace } = this.app;
    const leaf = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0] ?? workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
  }

  /** Reveals the existing workspace tab, or opens one in a new tab. */
  async openWorkspace(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(WORKSPACE_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: WORKSPACE_VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
}
