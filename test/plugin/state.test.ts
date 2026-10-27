// @vitest-environment jsdom
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ObsiBeansPlugin from '../../src/plugin/main.ts';
import { App, bridge, MarkdownRenderer, type Plugin } from '../support/obsidian.ts';
import { callsOf, makeProject, makeSandbox, script, trust, writeScriptedBeans, type Sandbox, type Step } from '../support/project.ts';

let sandbox: Sandbox;
let loadedPlugins: ObsiBeansPlugin[];
beforeEach(async () => {
  sandbox = await makeSandbox();
  loadedPlugins = [];
});
afterEach(async () => {
  for (const plugin of loadedPlugins) {
    bridge<Plugin>(plugin).unload();
    await plugin.runner.dispose();
  }
  await sandbox.dispose();
});

const A = 'FX-aaaaa';
const B = 'FX-bbbbb';
const row = (id: string): Record<string, unknown> => ({
  id,
  slug: 't',
  path: `${id}--t.md`,
  title: id,
  status: 'todo',
  type: 'task',
  priority: 'normal',
  tags: [],
  createdAt: '2026-10-26T20:00:00Z',
  updatedAt: '2026-10-26T20:00:00Z',
  parentId: null,
  blockingIds: [],
  blockedByIds: [],
  blockedBy: [],
  children: [],
});
const listing = (...ids: string[]): Step => ({ when: 'beans\\(filter', stdout: { beans: ids.map(row) } });
const bean = (id: string): string => `---\n# ${id}\ntitle: ${id}\nstatus: todo\ntype: task\npriority: normal\n---\n`;

/** A bound plugin over a vault with one project and a scripted Beans that answers `steps` in order. */
async function boundPlugin(steps: Step[], data: Record<string, unknown> = {}): Promise<{ app: App; plugin: ObsiBeansPlugin; shell: Plugin }> {
  await makeProject(sandbox.vault);
  await writeFile(join(sandbox.vault, 'Task root', `${A}--t.md`), bean(A));
  const executable = await writeScriptedBeans(sandbox.outside);
  await script(sandbox.outside, steps);
  const app = new App(sandbox.vault);
  const plugin = new ObsiBeansPlugin(bridge(app), bridge({ id: 'obsibeans' }));
  const shell = bridge<Plugin>(plugin);
  shell.data = { executable, ...(await trust(executable)), config: '', ...data };
  loadedPlugins.push(plugin);
  await plugin.onload();
  await plugin.rebind();
  return { app, plugin, shell };
}

const listCalls = async (): Promise<number> => (await callsOf(sandbox.outside)).filter((call) => call.query.includes('beans(filter')).length;

describe('shared state in the plugin shell', () => {
  it('starts loading the project once the binding is verified, and not before', async () => {
    const { plugin } = await boundPlugin([listing(A)]);

    await expect.poll(() => plugin.state?.getSnapshot().status).toBe('ready');
    expect(plugin.state?.getSnapshot().beans.map((one) => one.id)).toEqual([A]);
  });

  it('has no state while the project is unbound', async () => {
    const app = new App(sandbox.vault);
    const plugin = new ObsiBeansPlugin(bridge(app), bridge({ id: 'obsibeans' }));
    loadedPlugins.push(plugin);
    await plugin.onload();
    await plugin.rebind();

    expect(plugin.state).toBeUndefined();
  });

  it('refreshes after a vault event under the task root, once for a burst, and ignores other paths', async () => {
    const { app, plugin } = await boundPlugin([listing(A), listing(A, B), listing(A, B)]);
    await expect.poll(() => plugin.state?.getSnapshot().status).toBe('ready');

    for (const path of ['Notes/elsewhere.md', 'Task root 2/x.md']) app.vault.trigger('modify', { path });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(await listCalls()).toBe(1);

    for (let burst = 0; burst < 5; burst++) app.vault.trigger('create', { path: `Task root/${B}--t.md` });
    app.vault.trigger('modify', { path: `Task root/${B}--t.md` });
    app.vault.trigger('rename', { path: `Task root/${B}--t.md` }, 'Elsewhere/old.md');
    app.vault.trigger('delete', { path: `Task root/${A}--t.md` });

    await expect.poll(() => plugin.state?.getSnapshot().beans.length).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(await listCalls()).toBe(2);
  });

  it('replaces the state when the bound config changes, and disposes the old one', async () => {
    const { app, plugin } = await boundPlugin([listing(A), listing(A, B)]);
    await expect.poll(() => plugin.state?.getSnapshot().status).toBe('ready');
    const first = plugin.state;
    const stale = first?.getSnapshot();

    app.vault.trigger('modify', { path: '.beans.yml' });

    await expect.poll(() => plugin.state !== undefined && plugin.state !== first && plugin.state.getSnapshot().beans.length === 2).toBe(true);
    first?.vaultChanged(`Task root/${B}--t.md`);
    expect(first?.getSnapshot()).toBe(stale);
  });

  it('notices a changed config at the next refresh and rebinds, because Obsidian reports no events for it', async () => {
    const { plugin, shell } = await boundPlugin([listing(A), listing(A, B)]);
    await expect.poll(() => plugin.state?.getSnapshot().status).toBe('ready');
    const first = plugin.state;

    await writeFile(join(sandbox.vault, '.beans.yml'), 'beans:\n    path: Task root\n    prefix: FX-\n    id_length: 5\n    default_status: draft\n');
    await shell.commands.find((command) => command.id === 'refresh')?.callback?.();

    await expect.poll(() => plugin.state !== first && plugin.binding?.ok === true && plugin.binding.value.defaults.status === 'draft').toBe(true);
    const frozen = first?.getSnapshot();
    first?.vaultChanged(`Task root/${B}--t.md`);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(first?.getSnapshot()).toBe(frozen);
    await expect.poll(() => plugin.state?.getSnapshot().status).toBe('ready');
  });

  it('releases listeners, timers and processes on unload', async () => {
    const { app, plugin, shell } = await boundPlugin([listing(A), listing(A, B)]);
    await expect.poll(() => plugin.state?.getSnapshot().status).toBe('ready');
    const state = plugin.state;
    expect(app.vault.listenerCount).toBe(4);

    app.vault.trigger('modify', { path: `Task root/${A}--t.md` });
    shell.unload();

    expect(app.vault.listenerCount).toBe(0);
    expect(plugin.state).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(await listCalls()).toBe(1);
    expect(plugin.runner.activeCount).toBe(0);
    expect(state?.getSnapshot().refreshing).toBe(false);
  });

  it('refreshes on the Refresh command, immediately', async () => {
    const { shell, plugin } = await boundPlugin([listing(A), listing(A, B)]);
    await expect.poll(() => plugin.state?.getSnapshot().status).toBe('ready');

    await shell.commands.find((command) => command.id === 'refresh')?.callback?.();

    await expect.poll(() => plugin.state?.getSnapshot().beans.length).toBe(2);
  });
});

describe('draft storage', () => {
  it('stores drafts next to the settings, and a settings change does not erase them', async () => {
    const { plugin, shell } = await boundPlugin([listing(A)]);
    await expect.poll(() => plugin.state?.getSnapshot().status).toBe('ready');

    plugin.state?.setDraft('description', A, 'unsaved text', 'rev');
    await expect.poll(() => (shell.data as { drafts: unknown[] }).drafts.length).toBe(1);
    plugin.settings.config = '';
    await plugin.saveSettings();

    expect(shell.data).toMatchObject({ config: '', drafts: [{ kind: 'description', key: A, text: 'unsaved text', revision: 'rev' }] });
  });

  it('writes a pending draft when the plugin unloads, and restores it after a reload', async () => {
    const first = await boundPlugin([listing(A)]);
    await expect.poll(() => first.plugin.state?.getSnapshot().status).toBe('ready');
    first.plugin.state?.setDraft('description', A, 'typed just before closing', 'rev');
    first.shell.unload();
    await expect.poll(() => JSON.stringify(first.shell.data)).toContain('typed just before closing');

    const saved = first.shell.data as Record<string, unknown>;
    const second = await boundPlugin([listing(A)], { drafts: saved.drafts });
    await expect.poll(() => second.plugin.state?.getSnapshot().drafts.length).toBe(1);

    expect(second.plugin.state?.getSnapshot().drafts[0]?.draft.text).toBe('typed just before closing');
  });

  it('keeps drafts across a rebind', async () => {
    const { plugin } = await boundPlugin([listing(A), listing(A)]);
    await expect.poll(() => plugin.state?.getSnapshot().status).toBe('ready');
    plugin.state?.setDraft('description', A, 'kept', 'rev');

    await plugin.rebind();

    await expect.poll(() => plugin.state?.getSnapshot().drafts[0]?.draft.text).toBe('kept');
  });

  it('starts without drafts when stored data is damaged', async () => {
    const { plugin } = await boundPlugin([listing(A)], { drafts: 'garbage' });

    expect(plugin.state?.getSnapshot().drafts).toEqual([]);
  });
});

describe('inspector support in the plugin shell', () => {
  const file = `Task root/${A}--t.md`;

  it('reads one bean with its description and exposes the project creation defaults', async () => {
    const { plugin } = await boundPlugin([listing(A), { when: 'bean\\(id', stdout: { bean: { ...row(A), body: '\nHello' } } }]);
    await expect.poll(() => plugin.state?.getSnapshot().status).toBe('ready');

    expect(plugin.state?.defaults).toEqual({ status: 'todo', type: 'task', priority: 'normal' });
    expect(await plugin.state?.detail(A)).toMatchObject({ ok: true, value: { id: A, body: '\nHello' } });
  });

  it('opens the source note found by the listed path, and reports a missing file', async () => {
    const { app, plugin } = await boundPlugin([listing(A)]);
    await expect.poll(() => plugin.state?.getSnapshot().status).toBe('ready');

    expect(await plugin.openSource(A)).toBe(false);
    expect(await plugin.openSource('FX-zzzzz')).toBe(false);

    app.vault.files.add(file);
    expect(await plugin.openSource(A)).toBe(true);
    expect(app.workspace.leaves.at(-1)?.opened).toEqual([{ path: file }]);
  });

  it('builds the note link in the user link style, and none for a missing file or without a project', async () => {
    const { app, plugin } = await boundPlugin([listing(A)]);
    await expect.poll(() => plugin.state?.getSnapshot().status).toBe('ready');
    expect(plugin.sourceLink(A)).toBeUndefined();

    app.vault.files.add(file);
    expect(plugin.sourceLink(A)).toBe(`[[${file}]]`);

    plugin.state = undefined;
    expect(plugin.sourceLink(A)).toBeUndefined();
  });

  it('draws Markdown with Obsidian, makes task checkboxes read-only and releases the renderer', async () => {
    const { plugin } = await boundPlugin([listing(A)]);
    await expect.poll(() => plugin.state?.getSnapshot().status).toBe('ready');
    const el = document.createElement('div');

    const release = plugin.renderMarkdown('- [ ] one\n- [x] two', el, A);
    await expect.poll(() => el.querySelectorAll('input').length).toBe(2);
    const { component } = MarkdownRenderer.calls.at(-1) ?? {};

    expect([...el.querySelectorAll('input')].every((box) => box.disabled)).toBe(true);
    expect(component?.loaded).toBe(true);
    release();
    expect(component?.loaded).toBe(false);
  });

  it('shows the text itself when rendering fails', async () => {
    const { plugin } = await boundPlugin([listing(A)]);
    const el = document.createElement('div');
    MarkdownRenderer.fail = true;

    try {
      plugin.renderMarkdown('plain', el, A);
      await expect.poll(() => el.textContent).toBe('plain');
    } finally {
      MarkdownRenderer.fail = false;
    }
  });
});
