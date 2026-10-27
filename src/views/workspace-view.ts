import { ItemView, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import { mount, unmount } from 'svelte';
import type { WorkspaceHost } from './host.ts';
import { t } from './i18n.ts';
import IssueTab from './IssueTab.svelte';
import { DEFAULT_LAYOUT, parseLayout, type Layout } from './layout.ts';
import Sidebar from './Sidebar.svelte';
import Workspace from './Workspace.svelte';

export const WORKSPACE_VIEW_TYPE = 'obsibeans-workspace';
export const ISSUE_VIEW_TYPE = 'obsibeans-issue';
export const SIDEBAR_VIEW_TYPE = 'obsibeans-sidebar';

/** Shared lifecycle: the Svelte component lives exactly between `onOpen` and `onClose`, and can be remounted with new input. */
abstract class SvelteItemView extends ItemView {
  protected readonly host: WorkspaceHost;
  private component: ReturnType<typeof mount> | undefined;
  private opened = false;

  constructor(leaf: WorkspaceLeaf, host: WorkspaceHost) {
    super(leaf);
    this.host = host;
  }

  protected abstract render(): ReturnType<typeof mount>;

  /** Replaces the component, e.g. after restored state changed its input. A closed view stays unmounted. */
  protected remount(): void {
    if (!this.opened) return;
    const old = this.component;
    this.component = undefined;
    if (old) void unmount(old);
    this.component = this.render();
  }

  /** Close button and command. Detaching only closes this tab; it never quits Obsidian. */
  protected readonly closeTab = (): void => {
    this.leaf.detach();
  };

  protected override onOpen(): Promise<void> {
    this.opened = true;
    this.component ??= this.render();
    return Promise.resolve();
  }

  protected override async onClose(): Promise<void> {
    this.opened = false;
    const component = this.component;
    this.component = undefined;
    if (component) await unmount(component);
  }
}

/** The workspace tab: navigation, list and inspector. Its layout is saved with the Obsidian workspace layout. */
export class WorkspaceView extends SvelteItemView {
  private layout: Layout = DEFAULT_LAYOUT;

  getViewType(): string {
    return WORKSPACE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t('workspace.title');
  }

  override getIcon(): string {
    return 'list-checks';
  }

  override getState(): Record<string, unknown> {
    return { ...super.getState(), layout: this.layout };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    this.layout = parseLayout(typeof state === 'object' && state !== null && 'layout' in state ? state.layout : undefined);
    this.remount();
    await super.setState(state, result);
  }

  protected render(): ReturnType<typeof mount> {
    return mount(Workspace, {
      target: this.contentEl,
      props: {
        host: this.host,
        layout: this.layout,
        onLayout: (layout: Layout) => {
          this.layout = layout;
          this.app.workspace.requestSaveLayout();
        },
        onClose: this.closeTab,
      },
    });
  }
}

/** One bean in its own tab. Several can be open; each is identified by its full bean ID. */
export class IssueView extends SvelteItemView {
  beanId = '';

  getViewType(): string {
    return ISSUE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.beanId === '' ? t('issue.title') : this.beanId;
  }

  override getIcon(): string {
    return 'file-text';
  }

  override getState(): Record<string, unknown> {
    return { ...super.getState(), id: this.beanId };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const id = typeof state === 'object' && state !== null && 'id' in state && typeof state.id === 'string' ? state.id : '';
    if (id !== this.beanId) {
      this.beanId = id;
      this.remount();
    }
    await super.setState(state, result);
  }

  protected render(): ReturnType<typeof mount> {
    return mount(IssueTab, { target: this.contentEl, props: { host: this.host, id: this.beanId, onClose: this.closeTab } });
  }
}

/** The compact Ready / In progress list for a side pane. It shares the workspace's state and opens beans in issue tabs. */
export class SidebarView extends SvelteItemView {
  getViewType(): string {
    return SIDEBAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t('sidebar.title');
  }

  override getIcon(): string {
    return 'list-todo';
  }

  protected render(): ReturnType<typeof mount> {
    return mount(Sidebar, { target: this.contentEl, props: { host: this.host } });
  }
}
