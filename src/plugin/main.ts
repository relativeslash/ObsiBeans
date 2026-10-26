import { Plugin } from 'obsidian';
import { t } from '../views/i18n.ts';
import { WORKSPACE_VIEW_TYPE, WorkspaceView } from '../views/workspace-view.ts';
import { ObsiBeansSettingTab } from './settings-tab.ts';

/** Plugin shell. Everything registered here is released by Obsidian when the plugin unloads. */
export default class ObsiBeansPlugin extends Plugin {
  override onload(): void {
    this.registerView(WORKSPACE_VIEW_TYPE, (leaf) => new WorkspaceView(leaf));
    this.addCommand({ id: 'open-workspace', name: t('command.openWorkspace'), callback: () => this.openWorkspace() });
    this.addSettingTab(new ObsiBeansSettingTab(this.app, this));
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
