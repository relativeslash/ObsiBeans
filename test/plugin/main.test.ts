// @vitest-environment jsdom
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SettingDefinition } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BindingDiagnostic } from '../../src/adapter/binding.ts';
import ObsiBeansPlugin from '../../src/plugin/main.ts';
import { describeBinding, ObsiBeansSettingTab } from '../../src/plugin/settings-tab.ts';
import { en } from '../../src/views/messages.en.ts';
import { ISSUE_VIEW_TYPE, IssueView, SIDEBAR_VIEW_TYPE, SidebarView, WORKSPACE_VIEW_TYPE, WorkspaceView } from '../../src/views/workspace-view.ts';
import { App, bridge, type Plugin, type PluginSettingTab, WorkspaceLeaf } from '../support/obsidian.ts';
import { makeProject, makeSandbox, trust, writeFakeBeans, type Sandbox } from '../support/project.ts';

let sandbox: Sandbox;
beforeEach(async () => {
  // jsdom has no ResizeObserver; Obsidian's Electron does. The layout is not measured in these tests.
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  sandbox = await makeSandbox();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await sandbox.dispose();
});

interface Loaded {
  app: App;
  plugin: ObsiBeansPlugin;
  shell: Plugin;
  tab: ObsiBeansSettingTab & PluginSettingTab;
}

/** Loads the plugin. Unless `settle` is false, waits for the first project check to finish. */
async function loadPlugin(
  data?: unknown,
  { vaultRoot = sandbox.vault, settle = true }: { vaultRoot?: string | null; settle?: boolean } = {},
): Promise<Loaded> {
  const app = new App(vaultRoot ?? undefined);
  const plugin = new ObsiBeansPlugin(bridge(app), bridge({ id: 'obsibeans' }));
  const shell = bridge<Plugin>(plugin);
  shell.data = data;
  await plugin.onload();
  if (settle) await plugin.rebind();
  return { app, plugin, shell, tab: bridge(shell.settingTabs[0]) };
}

/** The rows of the single settings group. */
function rowsOf(tab: ObsiBeansSettingTab): SettingDefinition[] {
  const [group] = tab.getSettingDefinitions();
  return group && 'items' in group ? bridge<SettingDefinition[]>(group.items ?? []) : [];
}

/** A stand-in for Obsidian's `Setting`, recording what the status row shows. */
class RecordingSetting {
  name = '';
  desc = '';
  setName(name: string): this {
    this.name = name;
    return this;
  }
  setDesc(desc: string): this {
    this.desc = desc;
    return this;
  }
}

/** Renders the status row the way Obsidian does, once, and keeps it live until `stop()`. */
function mountStatus(tab: ObsiBeansSettingTab): { row: RecordingSetting; stop: () => void } {
  const row = new RecordingSetting();
  const definition = rowsOf(tab).at(-1);
  const stop = definition && 'render' in definition ? definition.render(bridge(row), bridge(undefined)) : undefined;
  return { row, stop: typeof stop === 'function' ? stop : () => undefined };
}

const statusOf = (tab: ObsiBeansSettingTab): string => mountStatus(tab).row.desc;

describe('plugin shell', () => {
  it('registers the workspace view, open command and settings tab on load', async () => {
    const { app, shell, plugin } = await loadPlugin();

    expect([...app.workspace.viewCreators.keys()]).toEqual([WORKSPACE_VIEW_TYPE, SIDEBAR_VIEW_TYPE, ISSUE_VIEW_TYPE]);
    expect(shell.commands.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'open-workspace', name: en['command.openWorkspace'] },
      { id: 'open-sidebar', name: en['command.openSidebar'] },
      { id: 'refresh', name: en['command.refresh'] },
      { id: 'close-view', name: en['command.closeView'] },
      { id: 'insert-link', name: en['command.insertLink'] },
      { id: 'convert-selection', name: en['command.convertSelection'] },
    ]);
    expect(bridge<Plugin>(plugin).ribbon.map(({ icon, title }) => ({ icon, title }))).toEqual([{ icon: 'list-checks', title: en['command.openWorkspace'] }]);
    expect(shell.settingTabs).toHaveLength(1);
    expect(shell.settingTabs[0]).toBeInstanceOf(ObsiBeansSettingTab);
  });

  it('adds the note actions to the editor menu and tells followers when Obsidian has resolved links', async () => {
    const { app, plugin } = await loadPlugin();
    expect(app.workspace.handlers.map(({ name }) => name)).toEqual(['editor-menu']);
    const listener = vi.fn();
    plugin.onBindingChange(listener);

    app.metadataCache.trigger('resolved');

    expect(listener).toHaveBeenCalledTimes(1);
    // Without a bound project there is no bean file, hence no related notes, and a missing note does not open.
    expect(plugin.relatedNotes('FX-aaaaa')).toEqual([]);
    expect(await plugin.openNote('Notes/A.md')).toBe(false);
    const addItem = vi.fn();
    const editor = { getValue: () => '', getSelection: () => '', getCursor: () => ({ line: 0, ch: 0 }), posToOffset: () => 0 };
    (app.workspace.handlers[0]?.callback as (...args: unknown[]) => void)({ addItem }, editor, { file: { path: 'A.md' } });
    expect(addItem).not.toHaveBeenCalled();
  });

  it('opens one sidebar leaf and reveals it again instead of opening another', async () => {
    const { app, shell } = await loadPlugin();
    const open = shell.commands.find((command) => command.id === 'open-sidebar')?.callback;

    await open?.();
    await open?.();

    const leaves = app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.view).toBeInstanceOf(SidebarView);
  });

  it('opens one workspace tab and reveals it again instead of opening another', async () => {
    const { app, shell } = await loadPlugin();
    const open = shell.commands[0]?.callback;

    await open?.();
    await open?.();

    const leaves = app.workspace.getLeavesOfType(WORKSPACE_VIEW_TYPE);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.view).toBeInstanceOf(WorkspaceView);
    expect(app.workspace.revealed).toEqual([leaves[0], leaves[0]]);
  });
});

describe('issue tabs and closing', () => {
  it('opens one tab per bean, reveals an open one and keeps several beans apart', async () => {
    const { app, plugin } = await loadPlugin();

    await plugin.openIssue('OB-aaaa');
    await plugin.openIssue('OB-bbbb');
    await plugin.openIssue('OB-aaaa');

    const leaves = app.workspace.getLeavesOfType(ISSUE_VIEW_TYPE);
    expect(leaves.map((leaf) => (leaf.view as unknown as IssueView).beanId)).toEqual(['OB-aaaa', 'OB-bbbb']);
    expect(app.workspace.revealed).toEqual([leaves[0], leaves[1], leaves[0]]);
  });

  it('offers Close Beans view only while a Beans tab is active, and closes just that tab', async () => {
    const { app, shell, plugin } = await loadPlugin();
    await plugin.openWorkspace();
    await plugin.openIssue('OB-aaaa');
    const close = shell.commands.find((command) => command.id === 'close-view');

    expect(close?.checkCallback?.(true)).toBe(false);
    app.workspace.activeLeaf = app.workspace.getLeavesOfType(ISSUE_VIEW_TYPE)[0];
    expect(close?.checkCallback?.(true)).toBe(true);
    expect(app.workspace.leaves).toHaveLength(2);
    expect(close?.checkCallback?.(false)).toBe(true);
    await vi.waitFor(() => { expect(app.workspace.getLeavesOfType(ISSUE_VIEW_TYPE)).toHaveLength(0); });
    expect(app.workspace.getLeavesOfType(WORKSPACE_VIEW_TYPE)).toHaveLength(1);
    app.workspace.activeLeaf = new WorkspaceLeaf(app.workspace);
    expect(close?.checkCallback?.(true)).toBe(false);
  });

  it('tells views about setting changes, so density applies at once', async () => {
    const { tab, plugin } = await loadPlugin();
    let calls = 0;
    const stop = plugin.onBindingChange(() => calls++);

    await tab.setControlValue('density', 'compact');
    await tab.setControlValue('density', 'huge');

    expect(plugin.density).toBe('compact');
    expect(tab.getControlValue('density')).toBe('compact');
    expect(calls).toBe(1);
    expect(plugin.bindingText).toBe(en['binding.executable-not-set']);
    stop();
  });

  it('keeps a saved density across reloads and ignores an unknown one', async () => {
    expect((await loadPlugin({ density: 'compact' })).plugin.density).toBe('compact');
    expect((await loadPlugin({ density: 'tiny' })).plugin.density).toBe('comfortable');
  });
});

describe('project binding settings', () => {
  it('declares the executable, trust action, configuration and binding status', async () => {
    const { tab } = await loadPlugin();

    const items = rowsOf(tab);

    expect(tab.getSettingDefinitions()).toMatchObject([
      { type: 'group', heading: en['settings.project.heading'] },
      { type: 'group', heading: en['settings.view.heading'], items: [{ control: { type: 'dropdown', key: 'density', options: { comfortable: en['settings.density.comfortable'], compact: en['settings.density.compact'] } } }] },
    ]);
    expect(items.map((item) => item.name)).toEqual([
      en['settings.executable.name'],
      en['settings.confirm.name'],
      en['settings.config.name'],
      en['settings.project.binding'],
    ]);
    expect(items[0]).toMatchObject({ control: { type: 'text', key: 'executable' } });
    expect(items[2]).toMatchObject({ control: { type: 'text', key: 'config' } });
    expect(statusOf(tab)).toBe(en['binding.executable-not-set']);
    expect(mountStatus(tab).row.name).toBe(en['settings.project.binding']);
  });

  it('starts from defaults when stored data is damaged', async () => {
    for (const data of [undefined, null, 'text', 42, { executable: 5, config: ['x'] }]) {
      const { plugin } = await loadPlugin(data);

      expect(plugin.settings).toEqual({ executable: '', confirmedExecutable: '', confirmedDigest: '', config: '', density: 'comfortable' });
    }
  });

  it('reads and writes only its text settings, trimmed, and saves them', async () => {
    const { tab, shell, plugin } = await loadPlugin();

    await tab.setControlValue('executable', '  /opt/beans  ');
    await tab.setControlValue('config', 'sub/.beans.yml');
    await tab.setControlValue('confirmedExecutable', '/forged');
    await tab.setControlValue('config', 7);

    expect(tab.getControlValue('executable')).toBe('/opt/beans');
    expect(tab.getControlValue('config')).toBe('sub/.beans.yml');
    expect(tab.getControlValue('confirmedExecutable')).toBeUndefined();
    expect(plugin.settings.confirmedExecutable).toBe('');
    expect(shell.data).toEqual({ executable: '/opt/beans', confirmedExecutable: '', confirmedDigest: '', config: 'sub/.beans.yml', density: 'comfortable', schemaVersion: 1, savedViews: [], drafts: [] });
  });

  it('requires an explicit trust step, then binds and remembers it across reloads', async () => {
    await makeProject(sandbox.vault);
    const executable = await writeFakeBeans(sandbox.outside);
    const { tab, plugin, shell } = await loadPlugin();

    await tab.setControlValue('executable', executable);
    expect(plugin.binding).toEqual({ ok: false, diagnostic: { code: 'executable-untrusted', path: executable } });
    expect(statusOf(tab)).toContain('not trusted yet');

    const trust = rowsOf(tab)[1];
    const { row, stop } = mountStatus(tab);
    if (trust && 'action' in trust) trust.action(document.createElement('div'), 1);
    await expect.poll(() => plugin.binding?.ok).toBe(true);

    expect(plugin.settings.confirmedExecutable).toBe(executable);
    expect(row.desc).toContain('Bound to Beans 0.4.2');
    stop();

    const reloaded = await loadPlugin(shell.data);
    expect(reloaded.plugin.binding).toMatchObject({ ok: true, value: { executable, taskRoot: join(sandbox.vault, 'Task root') } });
  });

  it('does not store trust for an executable that fails the checks', async () => {
    const { plugin, tab } = await loadPlugin();
    await tab.setControlValue('executable', 'relative/beans');

    await plugin.confirmExecutable();

    expect(plugin.settings.confirmedExecutable).toBe('');
    expect(plugin.binding).toEqual({ ok: false, diagnostic: { code: 'executable-not-absolute', path: 'relative/beans' } });
  });

  it('withdraws trust when the executable entry changes', async () => {
    await makeProject(sandbox.vault);
    const executable = await writeFakeBeans(sandbox.outside);
    const other = await writeFakeBeans(sandbox.outside, 'beans 0.4.2 (other) built now', 'other');
    const { plugin, tab } = await loadPlugin({ executable, ...(await trust(executable)), config: '' });
    expect(plugin.binding?.ok).toBe(true);

    await tab.setControlValue('executable', other);

    expect(plugin.binding).toEqual({ ok: false, diagnostic: { code: 'executable-untrusted', path: other } });
  });

  it('reports a vault that is not on a local disk', async () => {
    const { plugin, tab } = await loadPlugin(undefined, { vaultRoot: null });

    await plugin.confirmExecutable();

    expect(plugin.binding).toEqual({ ok: false, diagnostic: { code: 'vault-not-local' } });
    expect(statusOf(tab)).toBe(en['binding.vault-not-local']);
  });

  it('shows the checking state while a check runs and drops a superseded result', async () => {
    await makeProject(sandbox.vault);
    const slow = join(sandbox.outside, 'slow');
    await writeFile(slow, `#!${process.execPath}\nsetTimeout(() => console.log('beans 0.4.2 (slow) built now'), 1500)\n`);
    await chmod(slow, 0o755);
    const { plugin, tab } = await loadPlugin({ executable: slow, ...(await trust(slow)), config: '' }, { settle: false });
    const { row } = mountStatus(tab);
    expect(plugin.binding).toBeUndefined();
    expect(statusOf(tab)).toBe(en['binding.checking']);
    await expect.poll(() => plugin.runner.activeCount).toBe(1);

    plugin.settings.executable = '';
    await plugin.rebind();
    await expect.poll(() => plugin.runner.activeCount).toBe(0);

    expect(plugin.binding).toEqual({ ok: false, diagnostic: { code: 'executable-not-set' } });
    expect(row.desc).toBe(en['binding.executable-not-set']);
  });

  it('stops notifying a status row once it is torn down', async () => {
    const { plugin, tab } = await loadPlugin();
    const { row, stop } = mountStatus(tab);
    stop();
    plugin.settings.executable = '/somewhere/else';

    await plugin.rebind();

    expect(row.desc).toBe(en['binding.executable-not-set']);
  });

  it('releases running processes on unload and keeps the unload result out of state', async () => {
    await makeProject(sandbox.vault);
    const slow = join(sandbox.outside, 'slow');
    await writeFile(slow, `#!${process.execPath}\nsetTimeout(() => {}, 60000)\n`);
    await chmod(slow, 0o755);
    const { plugin } = await loadPlugin({ executable: slow, ...(await trust(slow)), config: '' }, { settle: false });
    await expect.poll(() => plugin.runner.activeCount).toBe(1);

    plugin.onunload();

    await expect.poll(() => plugin.runner.activeCount).toBe(0);
    expect(plugin.runner.activeCount).toBe(0);
    expect(plugin.binding).toBeUndefined();
  });
});

describe('describeBinding', () => {
  it('says so when the bound build is not the audited release', () => {
    const binding = { executable: '/x/beans', configPath: '/v/.beans.yml', projectDir: '/v', taskRoot: '/v/t', taskRootInVault: 't', configInVault: '.beans.yml', configDigest: '', prefix: '', idLength: 4, defaults: { status: 'todo', type: 'task' } };

    expect(describeBinding({ ok: true, value: { ...binding, version: '0.4.2', verified: true } })).toBe('Bound to Beans 0.4.2. Task root: /v/t');
    expect(describeBinding({ ok: true, value: { ...binding, version: 'dev', verified: false } })).toBe(
      'Bound to Beans dev, a build this plugin has not verified (supported release: 0.4.2). Task root: /v/t',
    );
  });

  it('formats every diagnostic with its details instead of a raw key', () => {
    const diagnostics: BindingDiagnostic[] = [
      { code: 'executable-failed', reason: 'exit', detail: 'exit code 7' },
      { code: 'executable-unsupported-version', found: 'beans dev', supported: '0.4.2' },
      { code: 'config-invalid', path: '.beans.yml', detail: 'bad' },
      { code: 'binding-failed', detail: 'oops' },
      { code: 'task-root-outside-vault', path: '../x' },
    ];

    expect(diagnostics.map((diagnostic) => describeBinding({ ok: false, diagnostic }))).toEqual([
      'The Beans executable failed (exit). exit code 7',
      'Unsupported Beans version. Found "beans dev"; this plugin supports 0.4.2 and development builds.',
      'The project configuration .beans.yml is invalid: bad',
      'The project could not be checked: oops',
      'The task root is outside the vault: ../x',
    ]);
  });
});
