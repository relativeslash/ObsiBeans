import { ItemView } from 'obsidian';
import { mount, unmount } from 'svelte';
import { t } from './i18n.ts';
import Workspace from './Workspace.svelte';

export const WORKSPACE_VIEW_TYPE = 'obsibeans-workspace';

/** Obsidian host for the Svelte workspace. The component lives exactly between onOpen and onClose. */
export class WorkspaceView extends ItemView {
  private component: ReturnType<typeof mount> | undefined;

  getViewType(): string {
    return WORKSPACE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t('workspace.title');
  }

  override getIcon(): string {
    return 'list-checks';
  }

  protected override onOpen(): Promise<void> {
    this.component ??= mount(Workspace, { target: this.contentEl });
    return Promise.resolve();
  }

  protected override async onClose(): Promise<void> {
    const component = this.component;
    this.component = undefined;
    if (component) await unmount(component);
  }
}
