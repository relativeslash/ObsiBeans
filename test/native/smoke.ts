/**
 * Native-window smoke test, separate from the headless checks. Loads dist/ into a disposable vault in an
 * isolated Obsidian instance with its own profile directory, so the user's running Obsidian and vaults are
 * untouched. Checks the app version, enable, command, view mount, settings, project binding through Obsidian's
 * own vault adapter and YAML parser (against a fake Beans executable), unmount on disable, reload and runtime errors.
 *
 * Needs a desktop session. OBSIDIAN_BIN is the launcher (default `obsidian`); OBSIDIAN_ASAR is the app package
 * of the target version (default ~/.config/obsidian/obsidian-<minAppVersion>.asar).
 */
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { en } from '../../src/views/messages.en.ts';

interface Manifest {
  readonly id: string;
  readonly minAppVersion: string;
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as Manifest;
const asar = process.env.OBSIDIAN_ASAR ?? join(homedir(), '.config', 'obsidian', `obsidian-${manifest.minAppVersion}.asar`);
const launcher = process.env.OBSIDIAN_BIN ?? 'obsidian';
const port = 9300 + Math.floor(Math.random() * 600);

interface DevToolsMessage {
  readonly id?: number;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
  readonly result?: unknown;
  readonly error?: { message: string };
}

class DevToolsSession {
  readonly errors: string[] = [];
  private readonly pending = new Map<number, (message: DevToolsMessage) => void>();
  private nextId = 1;
  private readonly socket: WebSocket;

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as DevToolsMessage;
      if (message.id !== undefined) this.pending.get(message.id)?.(message);
      else if (message.method === 'Runtime.exceptionThrown') this.errors.push(JSON.stringify(message.params));
      else if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') this.errors.push(JSON.stringify(message.params.args));
    });
  }

  static async connect(url: string): Promise<DevToolsSession> {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    const session = new DevToolsSession(socket);
    await session.send('Runtime.enable');
    return session;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (message) => {
        this.pending.delete(id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluates an async expression in the Obsidian window and returns its JSON value. */
  async evaluate(expression: string): Promise<unknown> {
    const result = await this.send('Runtime.evaluate', { expression: `(async () => ${expression})()`, awaitPromise: true, returnByValue: true }) as
      { result: { value?: unknown }; exceptionDetails?: { exception?: { description?: string } } };
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluation failed');
    return result.result.value;
  }

  async waitFor(expression: string, what: string): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await this.evaluate(expression) === true) return;
      await delay(250);
    }
    throw new Error(`Timed out waiting for ${what}`);
  }

  close(): void {
    this.socket.close();
  }
}

async function windowSocketUrl(): Promise<string> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${String(port)}/json/list`)).json() as { type: string; url: string; webSocketDebuggerUrl: string }[];
      const page = targets.find((target) => target.type === 'page' && target.url.endsWith('/index.html'));
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Not listening yet.
    }
    await delay(500);
  }
  throw new Error('Obsidian did not open a debuggable vault window');
}

function check(condition: unknown, message: string): void {
  if (condition !== true) throw new Error(`Check failed: ${message}`);
  console.log(`PASS ${message}`);
}

async function main(): Promise<void> {
  if (!existsSync(asar)) throw new Error(`Target app package not found: ${asar}`);
  const sandbox = mkdtempSync(join(tmpdir(), 'obsibeans-native-'));
  const profile = join(sandbox, 'profile');
  const vault = join(sandbox, 'vault');
  const pluginDir = join(vault, '.obsidian', 'plugins', manifest.id);
  mkdirSync(vault);
  mkdirSync(profile);
  copyFileSync(asar, join(profile, basename(asar)));
  writeFileSync(join(profile, 'obsidian.json'), JSON.stringify({ vaults: { obsibeanssmoke01: { path: vault, ts: Date.now(), open: true } } }));

  // Obsidian binds its CLI socket in XDG_RUNTIME_DIR and would replace the running instance's socket.
  const runtimeDir = join(sandbox, 'runtime');
  mkdirSync(runtimeDir, { mode: 0o700 });
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_RUNTIME_DIR: runtimeDir };
  const { WAYLAND_DISPLAY, XDG_RUNTIME_DIR } = process.env;
  if (WAYLAND_DISPLAY && XDG_RUNTIME_DIR && !isAbsolute(WAYLAND_DISPLAY)) env.WAYLAND_DISPLAY = join(XDG_RUNTIME_DIR, WAYLAND_DISPLAY);
  const userSocket = XDG_RUNTIME_DIR ? join(XDG_RUNTIME_DIR, '.obsidian-cli.sock') : undefined;
  const socketIdentity = (): string => (userSocket && existsSync(userSocket) ? `${String(statSync(userSocket).ino)}@${String(statSync(userSocket).mtimeMs)}` : 'absent');
  const socketBefore = socketIdentity();

  const obsidian = spawn(launcher, [`--user-data-dir=${profile}`, `--remote-debugging-port=${String(port)}`], { stdio: 'ignore', detached: true, env });
  let session: DevToolsSession | undefined;
  try {
    session = await DevToolsSession.connect(await windowSocketUrl());
    const id = JSON.stringify(manifest.id);
    const unboundShown = `document.querySelector('.obsibeans-workspace .unbound')?.textContent?.includes(${JSON.stringify(en['binding.executable-not-set'])}) === true`;
    const click = (selector: string): Promise<unknown> => session?.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`) ?? Promise.reject(new Error('no session'));
    const screenshots = process.env.OBSIBEANS_SCREENSHOTS;
    const screenshot = async (name: string): Promise<void> => {
      if (!screenshots || !session) return;
      mkdirSync(screenshots, { recursive: true });
      const { data } = await session.send('Page.captureScreenshot', { format: 'png' }) as { data: string };
      writeFileSync(join(screenshots, `${name}.png`), Buffer.from(data, 'base64'));
    };

    await session.waitFor(`typeof app !== 'undefined' && app.workspace.layoutReady`, 'the workspace layout');
    const version = await session.evaluate(`require('electron').ipcRenderer.sendSync('version')`);
    check(version === manifest.minAppVersion, `Obsidian runs the target version ${manifest.minAppVersion} (got ${String(version)})`);

    // A vault that already contains plugins on first open shows the trust prompt, so install after opening.
    mkdirSync(pluginDir, { recursive: true });
    for (const file of ['dist/main.js', 'manifest.json', 'dist/styles.css']) {
      if (existsSync(file)) copyFileSync(file, join(pluginDir, basename(file)));
    }
    await session.evaluate(`app.plugins.loadManifests()`);
    check(await session.evaluate(`!document.querySelector('.modal-container')`), 'no dialog asks for input');
    await session.evaluate(`app.plugins.setEnable(true)`);
    await session.evaluate(`app.plugins.enablePluginAndSave(${id})`);
    check(await session.evaluate(`!!app.plugins.plugins[${id}]`), 'the plugin loads');

    await session.evaluate(`app.commands.executeCommandById(${id} + ':open-workspace')`);
    await session.waitFor(unboundShown, 'the workspace view');
    await session.evaluate(`app.commands.executeCommandById(${id} + ':open-workspace')`);
    await delay(500);
    check(await session.evaluate(`document.querySelectorAll('.obsibeans-workspace').length === 1`), 'the open command opens one workspace tab and reuses it');

    const settingsText = await session.evaluate(`(app.setting.open(), app.setting.openTabById(${id}), await new Promise(requestAnimationFrame), app.setting.activeTab?.containerEl.textContent ?? '')`);
    await session.evaluate(`app.setting.close()`);
    check(typeof settingsText === 'string' && settingsText.includes(en['settings.project.heading']) && settingsText.includes(en['binding.executable-not-set']),
      'the settings tab renders the declared project settings');

    // Binding needs the real vault adapter and parseYaml. A Node script outside the vault stands in for Beans.
    // It answers `version`, a bean read, a creation, and any other GraphQL call with the beans found in the task root,
    // so that the plugin's state follows real file changes.
    const fakeBeans = join(sandbox, 'beans');
    writeFileSync(fakeBeans, `#!${process.execPath}
const fs = require('fs');
if (process.argv.includes('version')) { console.log('beans 0.4.2 (fake) built now'); process.exit(0); }
const NL = String.fromCharCode(10);
const args = process.argv;
const query = args[args.length - 1];
const vars = JSON.parse(args[args.indexOf('-v') + 1] || '{}');
const names = () => fs.readdirSync('Task root').filter((name) => name.endsWith('.md'));
const read = (name) => {
  const text = fs.readFileSync('Task root/' + name, 'utf8');
  return { id: name.split('--')[0], slug: 'x', path: name, title: /^title: (.*)$/m.exec(text)?.[1] ?? '', status: 'todo', type: /^type: (.*)$/m.exec(text)?.[1] ?? 'task', priority: 'normal', tags: [],
    createdAt: '', updatedAt: '', parentId: /^parent: (.*)$/m.exec(text)?.[1] ?? null, blockingIds: [], blockedByIds: [], blockedBy: [], children: [],
    body: NL + (text.split('---' + NL)[2] ?? '').trimEnd() };
};
if (query.includes('createBean')) {
  const name = 'FX-crtd1--created.md';
  fs.writeFileSync('Task root/' + name, '---' + NL + 'title: ' + vars.input.title + NL + '---' + NL + (vars.input.body ?? '') + NL);
  console.log(JSON.stringify({ createBean: read(name) }));
  process.exit(0);
}
if (query.includes('bean(id')) {
  const name = names().find((one) => one.startsWith(vars.id + '--'));
  console.log(JSON.stringify({ bean: name ? read(name) : null }));
  process.exit(0);
}
console.log(JSON.stringify({ beans: names().map((name) => { const { body, ...row } = read(name); return row; }) }));
`);
    chmodSync(fakeBeans, 0o755);
    mkdirSync(join(vault, 'Task root'));
    writeFileSync(join(vault, '.beans.yml'), 'beans:\n    path: Task root\n    prefix: FX-\n    id_length: 5\n');
    const bound = await session.evaluate(`(async () => {
      const plugin = app.plugins.plugins[${id}];
      plugin.settings.executable = ${JSON.stringify(fakeBeans)};
      await plugin.confirmExecutable();
      return plugin.binding?.ok === true && plugin.binding.value.version === '0.4.2' && plugin.binding.value.prefix === 'FX-' && plugin.binding.value.idLength === 5;
    })()`);
    check(bound, 'the trusted executable binds the vault project through the real vault adapter and YAML parser');

    // Real vault events: changes made outside Obsidian, as the Beans CLI or an agent would, reach the shared state.
    const taskFile = join(vault, 'Task root', 'FX-aaaaa--one.md');
    const titles = `app.plugins.plugins[${id}].state?.getSnapshot().beans.map((bean) => bean.title).join()`;
    await session.waitFor(`app.plugins.plugins[${id}].state?.getSnapshot().status === 'empty'`, 'the empty project');
    check(true, 'the project loads through the real vault adapter and shows as empty');
    await session.evaluate(`(window.vaultEvents = [], app.vault.on('create', (file) => window.vaultEvents.push('create ' + file.path)), app.vault.on('modify', (file) => window.vaultEvents.push('modify ' + file.path)), true)`);
    writeFileSync(taskFile, '---\ntitle: First\n---\n');
    await session.waitFor(`${titles} === 'First'`, 'a created file to appear');
    check(true, 'a file created outside Obsidian appears in the shared state');
    writeFileSync(taskFile, '---\ntitle: Second\n---\n');
    await session.waitFor(`${titles} === 'Second'`, 'a modified file to refresh');
    check(true, 'a file modified outside Obsidian refreshes the shared state');
    renameSync(taskFile, join(vault, 'Task root', 'FX-aaaaa--renamed.md'));
    await session.waitFor(`app.plugins.plugins[${id}].state?.getSnapshot().beans[0]?.path === 'FX-aaaaa--renamed.md'`, 'a renamed file to refresh');
    check(true, 'a file renamed outside Obsidian refreshes the shared state');
    unlinkSync(join(vault, 'Task root', 'FX-aaaaa--renamed.md'));
    await session.waitFor(`app.plugins.plugins[${id}].state?.getSnapshot().status === 'empty'`, 'a deleted file to leave the project');
    check(true, 'a file deleted outside Obsidian leaves the shared state');
    writeFileSync(taskFile, '---\ntitle: Third\n---\n');
    await session.waitFor(`${titles} === 'Third'`, 'the refresh command target');
    const refreshedBefore = await session.evaluate(`app.plugins.plugins[${id}].state.getSnapshot().refreshedAt`) as number;
    await delay(20);
    await session.evaluate(`app.commands.executeCommandById(${id} + ':refresh')`);
    await session.waitFor(`app.plugins.plugins[${id}].state.getSnapshot().refreshedAt > ${String(refreshedBefore)}`, 'the Refresh command to reload');
    check(true, 'the Refresh command reloads the project at once');

    // The project config is not an indexed vault file; record whether Obsidian reports changes to it.
    writeFileSync(join(vault, '.beans.yml'), 'beans:\n    path: Task root\n    prefix: FX-\n    id_length: 5\n# touched\n');
    await delay(1500);
    console.log(`INFO config change events seen by the vault: ${String(await session.evaluate(`window.vaultEvents.filter((event) => event.endsWith('.beans.yml')).join() || 'none'`))}`);

    // The config is not an indexed vault file, so a refresh is what notices that it changed, and rebinds.
    const rebound = await session.evaluate(`(async () => {
      const plugin = app.plugins.plugins[${id}];
      const old = plugin.state;
      await app.vault.adapter.write('.beans.yml', 'beans:\\n    path: Task root\\n    prefix: FX-\\n    id_length: 5\\n    default_status: draft\\n');
      await app.commands.executeCommandById(${id} + ':refresh');
      for (let attempt = 0; attempt < 40; attempt++) {
        if (plugin.state && plugin.state !== old && plugin.binding?.ok && plugin.binding.value.defaults.status === 'draft') return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return false;
    })()`);
    check(rebound, 'a refresh notices a changed project config and rebinds');
    await session.waitFor(`app.plugins.plugins[${id}].state?.getSnapshot().status === 'ready'`, 'the rebound project to load');

    // The workspace, navigation, inspector, issue tabs and layout, in the real app.
    // The sandbox window is 1024px wide; with the sidebars open the pane is narrow, so close them for the wide layout.
    await session.evaluate(`(app.workspace.leftSplit.collapse(), app.workspace.rightSplit.collapse(), true)`);
    await session.waitFor(`document.querySelector('.obsibeans-workspace')?.clientWidth >= 760`, 'the workspace pane to be wide');
    const rowIds = `[...document.querySelectorAll('.obsibeans-workspace .row')].map((row) => row.dataset.id).join()`;
    await session.waitFor(`${rowIds} === 'FX-aaaaa'`, 'the bound workspace to list the bean');
    check(await session.evaluate(`document.querySelector('.obsibeans-workspace nav [aria-current="page"]')?.textContent.trim() === ${JSON.stringify(en['nav.all'])}`), 'All work is the active navigation entry');
        await session.evaluate(`[...document.querySelectorAll('.obsibeans-workspace .nav-item')].find((item) => item.textContent.trim() === ${JSON.stringify(en['nav.in-progress'])}).click()`);
    await session.waitFor(`document.querySelector('.obsibeans-workspace .message')?.textContent.includes(${JSON.stringify(en['list.noMatches'])}) === true`, 'the In progress view to explain it has no matches');
    await session.evaluate(`[...document.querySelectorAll('.obsibeans-workspace button')].find((button) => button.textContent.trim() === ${JSON.stringify(en['list.showAll'])}).click()`);
    await session.waitFor(`${rowIds} === 'FX-aaaaa'`, 'Show all work to bring the rows back');
    check(await session.evaluate(`app.workspace.getLeavesOfType('obsibeans-workspace')[0].view.getState().layout.nav === 'all'`), 'the navigation choice is part of the saved workspace layout');
    const rowRevision = await session.evaluate(`app.plugins.plugins[${id}].state?.getSnapshot().beans[0]?.revision`);
    writeFileSync(taskFile, '---\ntitle: Third\n---\nHello **bold** <img src=x onerror="window.xss = 1">\n\n- [ ] first item\n- [ ] second item\n');
    await session.waitFor(`app.plugins.plugins[${id}].state?.getSnapshot().beans[0]?.revision !== ${JSON.stringify(rowRevision)}`, 'the description change to load');
    await click(`.obsibeans-workspace .row`);
    await session.waitFor(`document.querySelector('.obsibeans-workspace .inspector h2')?.textContent === 'Third'`, 'the inspector to show the selected bean');
    check(true, 'selecting a row shows it in the inspector');
    await click(`.obsibeans-workspace .row`);
    await session.waitFor(`document.querySelector('.obsibeans-workspace .inspector h2')?.textContent === 'Third'`, 'the inspector to show the selected bean');

    // The inspector in the real app: Obsidian renders the description, untrusted content stays inert, and the source note actions resolve by ID.
    await session.waitFor(`!!document.querySelector('.obsibeans-workspace .rendered strong')`, 'the description to render');
    check(await session.evaluate(`(() => {
      const rendered = document.querySelector('.obsibeans-workspace .rendered');
      return rendered.querySelector('strong')?.textContent === 'bold' && !rendered.querySelector('[onerror]') && window.xss === undefined;
    })()`), 'the description renders as Markdown without executing embedded content');
    check(await session.evaluate(`(() => {
      const boxes = [...document.querySelectorAll('.obsibeans-workspace .rendered input[type="checkbox"]')];
      return boxes.length === 2 && boxes.every((box) => box.disabled) && document.querySelectorAll('.obsibeans-workspace .checklist input').length === 2;
    })()`), 'rendered task checkboxes are read-only and the checklist offers the two items');
    check(await session.evaluate(`app.plugins.plugins[${id}].sourceLink('FX-aaaaa')?.includes('FX-aaaaa--one') === true`), 'the note link resolves the current file by full ID in the link style of the vault');
    await session.evaluate(`[...document.querySelectorAll('.obsibeans-workspace .inspector button')].find((button) => button.textContent.trim() === ${JSON.stringify(en['action.openSource'])}).click()`);
    await session.waitFor(`app.workspace.getActiveFile()?.path === 'Task root/FX-aaaaa--one.md'`, 'the source note to open');
    check(true, 'Open source note opens the bean file in Obsidian');
    await session.waitFor(`!!app.workspace.activeEditor?.editor`, 'the source note editor to load');
    await delay(500);
    await session.evaluate(`(app.workspace.getLeavesOfType('markdown').forEach((leaf) => leaf.detach()), app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('obsibeans-workspace')[0], { focus: true }), true)`);

    // Creation in the real app: the form creates through the plugin and opens the new bean; the file is removed again to keep the project as the later steps expect.
    await session.evaluate(`[...document.querySelectorAll('.obsibeans-workspace .toolbar button')].find((button) => button.textContent.trim() === ${JSON.stringify(en['create.open'])}).click()`);
    await session.waitFor(`document.activeElement?.id === 'create-title'`, 'the creation form to open focused');
    await session.evaluate(`(() => { const input = document.querySelector('#create-title'); input.value = 'Brand new native'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await session.evaluate(`[...document.querySelectorAll('.obsibeans-workspace .create button')].find((button) => button.textContent.trim() === ${JSON.stringify(en['create.submit'])}).click()`);
    await session.waitFor(`document.querySelector('.obsibeans-workspace .inspector h2')?.textContent === 'Brand new native'`, 'the new bean to open in the inspector');
    check(existsSync(join(vault, 'Task root', 'FX-crtd1--created.md')), 'creating a bean writes it through Beans and opens it in the inspector');
    unlinkSync(join(vault, 'Task root', 'FX-crtd1--created.md'));
    await session.waitFor(`app.plugins.plugins[${id}].state?.getSnapshot().beans.length === 1`, 'the created bean to leave the project');
    await click(`.obsibeans-workspace .row`);
    await session.waitFor(`document.querySelector('.obsibeans-workspace .inspector h2')?.textContent === 'Third'`, 'the inspector to show the first bean again');
    await screenshot('workspace-wide');
    // Only theme variables colour the workspace, so flipping the body class shows the light theme.
    await session.evaluate(`document.body.classList.replace('theme-dark', 'theme-light')`);
    await screenshot('workspace-light');
    await session.evaluate(`document.body.classList.replace('theme-light', 'theme-dark')`);

    await session.evaluate(`[...document.querySelectorAll('.obsibeans-workspace .inspector button')].find((button) => button.textContent.trim() === ${JSON.stringify(en['action.openTab'])}).click()`);
    await session.waitFor(`document.querySelector('.obsibeans-issue .inspector h2')?.textContent === 'Third'`, 'the issue tab to show the bean');
    writeFileSync(join(vault, 'Task root', 'FX-bbbbb--second.md'), '---\ntitle: Fourth\n---\n');
    await session.waitFor(`app.plugins.plugins[${id}].state?.getSnapshot().beans.length === 2`, 'the second bean to load');
    await session.evaluate(`(async () => { const plugin = app.plugins.plugins[${id}]; await plugin.openIssue('FX-aaaaa'); await plugin.openIssue('FX-bbbbb'); await plugin.openIssue('FX-bbbbb'); })()`);
    check(await session.evaluate(`app.workspace.getLeavesOfType('obsibeans-issue').map((leaf) => leaf.view.beanId).sort().join() === 'FX-aaaaa,FX-bbbbb'`), 'several issue tabs open, one per bean, and an open one is revealed instead of duplicated');
    await screenshot('issue-tab');

    // Narrow pane: a 500px wide pane stacks list and details, and Back returns to the list.
    await session.evaluate(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('obsibeans-workspace')[0], { focus: true })`);
    await session.waitFor(`document.querySelector('.obsibeans-workspace')?.clientWidth >= 760`, 'the workspace tab to be visible again');
    await session.evaluate(`app.workspace.getLeavesOfType('obsibeans-workspace')[0].view.contentEl.style.width = '500px'`);
    await session.waitFor(`!!document.querySelector('.obsibeans-workspace.narrow') || !!document.querySelector('.narrow')`, 'the pane to collapse');
    check(await session.evaluate(`!document.querySelector('.narrow nav') && !document.querySelector('.narrow .splitter')`), 'a narrow pane collapses navigation and the splitter');
    await screenshot('workspace-narrow');
    await session.evaluate(`app.workspace.getLeavesOfType('obsibeans-workspace')[0].view.contentEl.style.width = ''`);
    await session.waitFor(`!document.querySelector('.narrow')`, 'the pane to expand again');

    // Board: switches in place, shows every bean as a card, and stays usable in dark, light and narrow panes.
    const buttonByText = (scope: string, label: string): string => `[...document.querySelectorAll(${JSON.stringify(scope)} + ' button')].find((button) => button.textContent.trim() === ${JSON.stringify(label)})`;
    await session.evaluate(`${buttonByText('.obsibeans-workspace .controls', en['view.board'])}.click()`);
    await session.waitFor(`document.querySelectorAll('.obsibeans-workspace .board .card').length === document.querySelectorAll('.obsibeans-workspace .board select').length && document.querySelectorAll('.obsibeans-workspace .board .card').length > 0`, 'the board to render');
    check(await session.evaluate(`document.querySelectorAll('.obsibeans-workspace .board .head').length === 5 && !document.querySelector('.obsibeans-workspace ul.rows')`), 'the Board switch replaces the list with five status columns');
    for (const theme of ['dark', 'light']) {
      await session.evaluate(`(document.body.classList.remove('theme-dark', 'theme-light'), document.body.classList.add('theme-${theme}'), true)`);
      await screenshot(`board-${theme}`);
    }
    await session.evaluate(`app.workspace.getLeavesOfType('obsibeans-workspace')[0].view.contentEl.style.width = '500px'`);
    await session.waitFor(`!!document.querySelector('.obsibeans-workspace.narrow')`, 'the board pane to collapse');
    // A selected bean shows its details full-pane while narrow; Back returns to the work view.
    await session.evaluate(`${buttonByText('.obsibeans-workspace .pane-detail', en['action.back'])}?.click()`);
    await session.waitFor(`document.querySelector('.obsibeans-workspace .pane-list')?.hidden === false`, 'the work view to show in the narrow pane');
    check(await session.evaluate(`(() => { const list = document.querySelector('.obsibeans-workspace .list'); return !!list && list.getBoundingClientRect().width > 0 && getComputedStyle(list).overflowX !== 'visible' && document.querySelectorAll('.obsibeans-workspace .board .head').length === 5; })()`), 'a narrow board keeps five columns and scrolls inside the work pane');
    await screenshot('board-narrow');
    await session.evaluate(`app.workspace.getLeavesOfType('obsibeans-workspace')[0].view.contentEl.style.width = ''`);
    await session.waitFor(`!document.querySelector('.narrow')`, 'the pane to expand after the board check');
    await session.evaluate(`${buttonByText('.obsibeans-workspace .controls', en['view.list'])}.click()`);
    await session.waitFor(`!!document.querySelector('.obsibeans-workspace ul.rows') && !document.querySelector('.obsibeans-workspace .board')`, 'the list to return');
    check(true, 'switching back shows the list again');

    // Saved views: plugin data only. Saving, applying and removing leave the bean files alone and survive a reload.
    const beanBefore = readFileSync(taskFile, 'utf8');
    await session.evaluate(`(() => { const input = document.querySelector('.obsibeans-workspace nav input[type="text"]'); input.value = 'Native view'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await session.evaluate(`${buttonByText('.obsibeans-workspace nav', en['saved.save'])}.click()`);
    await session.waitFor(`document.querySelector('.obsibeans-workspace nav [aria-current="page"]')?.textContent.trim() === 'Native view'`, 'the saved view to become the active entry');
    await session.waitFor(`app.plugins.plugins[${id}].savedViews.length === 1`, 'the saved view to be stored');
    await session.evaluate(`${buttonByText('.obsibeans-workspace nav', en['nav.blocked'])}.click()`);
    await session.evaluate(`${buttonByText('.obsibeans-workspace nav', 'Native view')}.click()`);
    await session.waitFor(`app.plugins.plugins[${id}].state.getSnapshot().filters.readiness === 'any' && app.workspace.getLeavesOfType('obsibeans-workspace')[0].view.getState().layout.savedView !== null`, 'the saved view to be applied again');
    check(await session.evaluate(`app.workspace.getLeavesOfType('obsibeans-workspace')[0].view.getState().layout.savedView === app.plugins.plugins[${id}].savedViews[0].view.id`), 'the applied saved view is part of the saved workspace layout');
    let stored: { schemaVersion?: number; savedViews?: { name: string }[] } = {};
    for (let attempt = 0; attempt < 20 && stored.savedViews?.length !== 1; attempt++) {
      await delay(100);
      stored = JSON.parse(readFileSync(join(pluginDir, 'data.json'), 'utf8')) as typeof stored;
    }
    check(stored.schemaVersion === 1 && stored.savedViews?.[0]?.name === 'Native view', 'the saved view is written to the plugin data with its schema version');
    check(readFileSync(taskFile, 'utf8') === beanBefore, 'saving and applying a view does not write the bean file');

    // Sidebar: a compact pane in the right split that follows the same state and keeps keyboard focus.
    await session.evaluate(`app.commands.executeCommandById(${id} + ':open-sidebar')`);
    await session.waitFor(`!!document.querySelector('section.sidebar h2') && document.querySelectorAll('section.sidebar h2').length === 2`, 'the sidebar to list Ready and In progress');
    check(await session.evaluate(`app.workspace.getLeavesOfType('obsibeans-sidebar').length === 1 && app.workspace.getLeavesOfType('obsibeans-sidebar')[0].getRoot() === app.workspace.rightSplit`), 'the sidebar opens in the right split, once');
    await session.evaluate(`app.commands.executeCommandById(${id} + ':open-sidebar')`);
    check(await session.evaluate(`app.workspace.getLeavesOfType('obsibeans-sidebar').length === 1`), 'opening the sidebar again reveals it instead of adding another');
    await screenshot('sidebar');
    check(await session.evaluate(`(() => { const row = document.querySelector('section.sidebar button.row'); if (!row) return document.querySelector('section.sidebar .message') !== null; row.focus(); return document.activeElement === row && row.getBoundingClientRect().width > 0; })()`), 'a sidebar row takes keyboard focus, or the sidebar says nothing is ready');
    check(await session.evaluate(`(() => { const bar = document.querySelector('section.sidebar'); return bar.scrollWidth <= bar.clientWidth + 1; })()`), 'the sidebar does not scroll sideways at its narrow width');
    await session.evaluate(`(app.workspace.getLeavesOfType('obsibeans-sidebar')[0].detach(), app.workspace.rightSplit.collapse(), true)`);
    await session.waitFor(`document.querySelector('.obsibeans-workspace')?.clientWidth >= 760`, 'the workspace pane to be wide after closing the sidebar');
    await session.evaluate(`${buttonByText('.obsibeans-workspace nav', en['saved.remove'])}.click()`);
    await session.evaluate(`${buttonByText('.obsibeans-workspace nav', en['saved.remove'])}.click()`);
    await session.waitFor(`app.plugins.plugins[${id}].savedViews.length === 0 && document.querySelector('.obsibeans-workspace nav [aria-current="page"]')?.textContent.trim() === ${JSON.stringify(en['nav.blocked'])}`, 'removing the applied saved view to fall back to the built-in entry used before it');
    check(readFileSync(taskFile, 'utf8') === beanBefore, 'removing a view does not write the bean file');
    await session.evaluate(`${buttonByText('.obsibeans-workspace nav', en['nav.all'])}.click()`);
    await session.waitFor(`document.querySelectorAll('.obsibeans-workspace button.row').length > 0`, 'All work to list the beans again');

    // Hierarchy: an epic with a child, opened with the keyboard in the real app; the two files are removed again afterwards.
    writeFileSync(join(vault, 'Task root', 'FX-hier1--epic.md'), '---\ntitle: Native epic\ntype: epic\n---\n');
    writeFileSync(join(vault, 'Task root', 'FX-hier2--child.md'), '---\ntitle: Native child\nparent: FX-hier1\n---\n');
    await session.waitFor(`app.plugins.plugins[${id}].state?.getSnapshot().beans.length === 4`, 'the hierarchy fixture to load');
    await session.evaluate(`${buttonByText('.obsibeans-workspace .controls', en['view.hierarchy'])}.click()`);
    const hierarchyIds = `[...document.querySelectorAll('.obsibeans-workspace .rows button.row')].map((row) => row.dataset.id).join()`;
    await session.waitFor(`${hierarchyIds}.includes('FX-hier1') && !${hierarchyIds}.includes('FX-hier2')`, 'the hierarchy to show the epic closed');
    const key = async (name: string, code: number): Promise<void> => {
      for (const type of ['keyDown', 'keyUp']) await session?.send('Input.dispatchKeyEvent', { type, key: name, code: name, windowsVirtualKeyCode: code });
    };
    await session.evaluate(`document.querySelector('.obsibeans-workspace button.row[data-id="FX-hier1"]').focus()`);
    await key('ArrowRight', 39);
    await session.waitFor(`${hierarchyIds}.includes('FX-hier2')`, 'ArrowRight to open the epic');
    check(await session.evaluate(`document.querySelector('.obsibeans-workspace li:has([data-id="FX-hier1"]) .progress')?.textContent === '0% complete: 0 completed, 0 scrapped, 1 open'`), 'the epic shows the progress of its leaf');
    await key('ArrowRight', 39);
    await session.waitFor(`document.activeElement?.dataset.id === 'FX-hier2'`, 'ArrowRight to enter the child');
    await key('ArrowLeft', 37);
    await session.waitFor(`document.activeElement?.dataset.id === 'FX-hier1'`, 'ArrowLeft to return to the parent');
    await screenshot('hierarchy-dark');
    await session.evaluate(`(document.body.classList.replace('theme-dark', 'theme-light'), true)`);
    await screenshot('hierarchy-light');
    await session.evaluate(`(document.body.classList.replace('theme-light', 'theme-dark'), true)`);
    await session.evaluate(`app.workspace.getLeavesOfType('obsibeans-workspace')[0].view.contentEl.style.width = '500px'`);
    await session.waitFor(`!!document.querySelector('.obsibeans-workspace.narrow')`, 'the hierarchy pane to collapse');
    await session.evaluate(`${buttonByText('.obsibeans-workspace .pane-detail', en['action.back'])}?.click()`);
    await session.waitFor(`document.querySelector('.obsibeans-workspace .pane-list')?.hidden === false`, 'the hierarchy to show in the narrow pane');
    await screenshot('hierarchy-narrow');
    await session.evaluate(`app.workspace.getLeavesOfType('obsibeans-workspace')[0].view.contentEl.style.width = ''`);
    await session.waitFor(`!document.querySelector('.narrow')`, 'the pane to expand after the hierarchy check');
    await session.evaluate(`${buttonByText('.obsibeans-workspace .controls', en['view.list'])}.click()`);
    await session.waitFor(`!!document.querySelector('.obsibeans-workspace ul.rows') && !document.querySelector('.obsibeans-workspace .twisty')`, 'the list to return');
    unlinkSync(join(vault, 'Task root', 'FX-hier1--epic.md'));
    unlinkSync(join(vault, 'Task root', 'FX-hier2--child.md'));
    await session.waitFor(`app.plugins.plugins[${id}].state?.getSnapshot().beans.length === 2`, 'the hierarchy fixture to leave the project');

    // Error state: with Beans gone, a refresh keeps the rows under a stale banner, and Refresh in the banner recovers.
    renameSync(fakeBeans, `${fakeBeans}.away`);
    await session.evaluate(`[...document.querySelectorAll('.obsibeans-workspace .toolbar button')].find((button) => button.textContent.trim() === ${JSON.stringify(en['action.refresh'])}).click()`);
    await session.waitFor(`document.querySelector('.obsibeans-workspace .banner[role="alert"]')?.textContent.includes(${JSON.stringify(en['list.stale'].split('{')[0])}) === true && document.querySelectorAll('.obsibeans-workspace .row').length > 0`, 'the stale banner over the old rows');
    check(await session.evaluate(`document.querySelector('.obsibeans-workspace footer')?.textContent.includes(${JSON.stringify(en['status.stale'])}) === true`), 'a failed refresh keeps the rows, says they are stale and offers Refresh');
    await screenshot('workspace-stale');
    renameSync(`${fakeBeans}.away`, fakeBeans);
    await session.evaluate(`[...document.querySelectorAll('.obsibeans-workspace .banner button')].find((button) => button.textContent.trim() === ${JSON.stringify(en['action.refresh'])}).click()`);
    await session.waitFor(`!document.querySelector('.obsibeans-workspace .banner[role="alert"]')`, 'the stale banner to clear after Refresh');
    check(true, 'Refresh in the stale banner recovers when Beans is back');

    // A large project in the real app: rows render, search narrows them, and the keyboard moves through them.
    const bulk = Array.from({ length: 2000 }, (_, n) => join(vault, 'Task root', `FX-l${String(n).padStart(4, '0')}--bulk.md`));
    for (const [n, file] of bulk.entries()) writeFileSync(file, `---\ntitle: Bulk ${String(n)}\n---\n`);
    const rowCount = `document.querySelectorAll('.obsibeans-workspace button.row').length`;
    const loadStart = Date.now();
    await session.evaluate(`[...document.querySelectorAll('.obsibeans-workspace .toolbar button')].find((button) => button.textContent.trim() === ${JSON.stringify(en['action.refresh'])}).click()`);
    await session.waitFor(`${rowCount} === 2002`, 'two thousand rows to render');
    const rendered = Date.now() - loadStart;
    console.log(`INFO 2002 rows loaded and rendered in ${String(rendered)} ms`);
    check(rendered < 10_000, 'a large list loads and renders in a few seconds');
    await session.evaluate(`(() => { const input = document.querySelector('.obsibeans-workspace input[type="search"]'); input.value = 'bulk 199'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await session.waitFor(`${rowCount} === 12`, 'search to narrow the list to the 12 beans whose title or ID contains "199"');
    check(await session.evaluate(`document.querySelector('.obsibeans-workspace .matches')?.textContent.includes('12 matches of 2002')`), 'the match count states matches out of the whole project');
    await session.evaluate(`(() => { const first = document.querySelector('.obsibeans-workspace button.row'); first.focus(); first.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true })); })()`);
    check(await session.evaluate(`document.activeElement === document.querySelectorAll('.obsibeans-workspace button.row')[1]`), 'j moves focus to the next row');
    await session.evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))`);
    check(await session.evaluate(`document.querySelector('.obsibeans-workspace .selection [role="status"]')?.textContent.includes('1 bean selected')`), 'Space selects the focused row');
    check(
      await session.evaluate(`(() => { const bar = document.querySelector('.obsibeans-workspace .bulk'); return !!bar && bar.textContent.includes('1 bean will be changed') && bar.querySelector('button.apply')?.disabled === true; })()`),
      'the bulk bar names its one target and offers no apply until a value is chosen',
    );
    await session.evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }))`);
    check(await session.evaluate(`document.activeElement === document.querySelector('.obsibeans-workspace input[type="search"]')`), '/ focuses the search field');
    await session.evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
    await session.waitFor(`${rowCount} === 2002`, 'Escape to clear the search');
    // The files stay: deleting two thousand files at once makes Obsidian's own file watcher report read errors for them.
    await session.evaluate(`app.plugins.plugins[${id}].state.clearSelection()`);

    // Close view: the command closes only the active Beans tab; Obsidian keeps running.
    await session.evaluate(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('obsibeans-issue')[0], { focus: true })`);
    await session.evaluate(`app.commands.executeCommandById(${id} + ':close-view')`);
    await session.waitFor(`app.workspace.getLeavesOfType('obsibeans-issue').length === 1`, 'the close command to close one issue tab');
    check(await session.evaluate(`app.workspace.getLeavesOfType('obsibeans-workspace').length === 1 && !!document.querySelector('.obsibeans-workspace .row')`), 'closing a Beans tab leaves the workspace and Obsidian running');

    const disposed = await session.evaluate(`(window.disposedState = app.plugins.plugins[${id}].state, window.disposedSnapshot = window.disposedState.getSnapshot(), true)`);
    check(disposed, 'a state exists to be released');
    await session.evaluate(`app.plugins.disablePlugin(${id})`);
    check(await session.evaluate(`!app.plugins.plugins[${id}] && !document.querySelector('.obsibeans-workspace')`), 'disabling unloads the plugin and unmounts the workspace');
    writeFileSync(join(vault, 'Task root', 'FX-ccccc--late.md'), '---\ntitle: Late\n---\n');
    await delay(1500);
    check(await session.evaluate(`window.disposedState.getSnapshot() === window.disposedSnapshot`), 'a change after unloading reaches no state: its listeners and timers are released');
    check(spawnSync('pgrep', ['-f', fakeBeans]).status === 1, 'no Beans process is left running');

    await session.evaluate(`app.plugins.enablePlugin(${id})`);
    await session.evaluate(`app.commands.executeCommandById(${id} + ':open-workspace')`);
    await session.waitFor(`document.querySelectorAll('.obsibeans-workspace .row').length > 0`, 'the workspace view after reload');
    check(true, 'the plugin reloads, remembers the trusted executable and lists the beans in the workspace again');

    const pluginErrors = session.errors.filter((error) => error.includes(manifest.id));
    session.errors.filter((error) => !pluginErrors.includes(error)).forEach((error) => {
      console.warn(`Unrelated Obsidian error: ${error.slice(0, 300)}`);
    });
    check(pluginErrors.length === 0, `no runtime errors mention ${manifest.id}${pluginErrors.length ? `: ${pluginErrors.join('\n')}` : ''}`);
  } finally {
    session?.close();
    if (obsidian.pid !== undefined) await stopProcessGroup(obsidian.pid);
    rmSync(sandbox, { recursive: true, force: true });
  }
  check(socketIdentity() === socketBefore, 'the running Obsidian CLI socket was left untouched');
}

/** Stops the isolated instance and all its child processes before its profile directory is deleted. */
async function stopProcessGroup(pid: number): Promise<void> {
  const alive = (): boolean => {
    try {
      process.kill(-pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  process.kill(-pid, 'SIGTERM');
  for (let attempt = 0; attempt < 40 && alive(); attempt++) await delay(250);
  if (alive()) process.kill(-pid, 'SIGKILL');
  for (let attempt = 0; attempt < 20 && alive(); attempt++) await delay(250);
  if (alive()) throw new Error(`Obsidian process group ${String(pid)} did not exit`);
}

await main();
