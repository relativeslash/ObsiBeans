// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import ObsiBeansPlugin from '../../src/plugin/main.ts';
import { ObsiBeansSettingTab } from '../../src/plugin/settings-tab.ts';
import { en } from '../../src/views/messages.en.ts';
import { WORKSPACE_VIEW_TYPE, WorkspaceView } from '../../src/views/workspace-view.ts';
import { App, bridge, type Plugin } from '../support/obsidian.ts';

function loadPlugin(): { app: App; plugin: ObsiBeansPlugin; shell: Plugin } {
  const app = new App();
  const plugin = new ObsiBeansPlugin(bridge(app), bridge({ id: 'obsibeans' }));
  plugin.onload();
  return { app, plugin, shell: bridge(plugin) };
}

describe('plugin shell', () => {
  it('registers the workspace view, open command and settings tab on load', () => {
    const { app, shell } = loadPlugin();

    expect([...app.workspace.viewCreators.keys()]).toEqual([WORKSPACE_VIEW_TYPE]);
    expect(shell.commands.map(({ id, name }) => ({ id, name }))).toEqual([{ id: 'open-workspace', name: en['command.openWorkspace'] }]);
    expect(shell.settingTabs).toHaveLength(1);
    expect(shell.settingTabs[0]).toBeInstanceOf(ObsiBeansSettingTab);
  });

  it('opens one workspace tab and reveals it again instead of opening another', async () => {
    const { app, shell } = loadPlugin();
    const open = shell.commands[0]?.callback;

    await open?.();
    await open?.();

    const leaves = app.workspace.getLeavesOfType(WORKSPACE_VIEW_TYPE);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.view).toBeInstanceOf(WorkspaceView);
    expect(app.workspace.revealed).toEqual([leaves[0], leaves[0]]);
  });

  it('declares the unbound project state as settings', () => {
    const { shell } = loadPlugin();
    const tab = bridge<ObsiBeansSettingTab>(shell.settingTabs[0]);

    expect(tab.getSettingDefinitions()).toEqual([{
      type: 'group',
      heading: en['settings.project.heading'],
      items: [{ name: en['settings.project.binding'], desc: en['settings.project.notBound'] }],
    }]);
  });
});
