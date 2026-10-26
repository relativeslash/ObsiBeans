import { FileSystemAdapter, parseYaml, Plugin } from 'obsidian';
import { bindProject, confirmExecutable } from '../adapter/binding.ts';
import { ProcessRunner } from '../adapter/process.ts';
import { t } from '../views/i18n.ts';
import { WORKSPACE_VIEW_TYPE, WorkspaceView } from '../views/workspace-view.ts';
import { parseSettings, type BindingState, type ObsiBeansSettings, type SettingsHost } from './settings.ts';
import { ObsiBeansSettingTab } from './settings-tab.ts';

/** Plugin shell. Everything registered here is released by Obsidian when the plugin unloads. */
export default class ObsiBeansPlugin extends Plugin implements SettingsHost {
  override settings: ObsiBeansSettings = parseSettings(undefined);
  binding: BindingState;
  /** Owns every Beans process of this session. */
  readonly runner = new ProcessRunner();
  private generation = 0;
  private readonly listeners = new Set<() => void>();

  override async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    this.registerView(WORKSPACE_VIEW_TYPE, (leaf) => new WorkspaceView(leaf));
    this.addCommand({ id: 'open-workspace', name: t('command.openWorkspace'), callback: () => this.openWorkspace() });
    this.addSettingTab(new ObsiBeansSettingTab(this.app, this, this));
    void this.rebind();
  }

  override onunload(): void {
    this.generation++;
    this.listeners.clear();
    void this.runner.dispose();
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

  saveSettings(): Promise<void> {
    return this.saveData(this.settings);
  }

  /** Rechecks the bound project. Cancels running Beans calls, and a superseded check never overwrites a newer one. */
  async rebind(): Promise<void> {
    const generation = ++this.generation;
    this.binding = undefined;
    this.publish();
    this.runner.cancelAll();
    const vaultRoot = this.vaultRoot();
    const result = vaultRoot === undefined
      ? { ok: false as const, diagnostic: { code: 'vault-not-local' as const } }
      : await bindProject({ ...this.settings, vaultRoot, parseYaml, runner: this.runner });
    if (generation === this.generation) {
      this.binding = result;
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
