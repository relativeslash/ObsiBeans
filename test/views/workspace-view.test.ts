// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { en } from '../../src/views/messages.en.ts';
import { WORKSPACE_VIEW_TYPE, WorkspaceView } from '../../src/views/workspace-view.ts';
import { App, bridge, type ItemView, WorkspaceLeaf } from '../support/obsidian.ts';

function createView(): { view: WorkspaceView; host: ItemView } {
  const view = new WorkspaceView(bridge(new WorkspaceLeaf(new App().workspace)));
  return { view, host: bridge(view) };
}

describe('workspace view', () => {
  it('identifies itself to Obsidian', () => {
    const { view } = createView();

    expect(view.getViewType()).toBe(WORKSPACE_VIEW_TYPE);
    expect(view.getDisplayText()).toBe(en['workspace.title']);
    expect(view.getIcon()).toBe('list-checks');
  });

  it('mounts the workspace once while open and removes it on close', async () => {
    const { host } = createView();

    await host.open();
    await host.open();
    const region = host.contentEl.querySelectorAll('section[aria-label]');
    expect(region).toHaveLength(1);
    expect(region[0]?.getAttribute('aria-label')).toBe(en['workspace.label']);
    expect(region[0]?.textContent).toBe(en['workspace.notBound']);

    await host.close();
    await host.close();
    expect(host.contentEl.childElementCount).toBe(0);
  });
});
