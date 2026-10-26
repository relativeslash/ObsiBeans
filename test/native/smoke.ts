/**
 * Native-window smoke test, separate from the headless checks. Loads dist/ into a disposable vault in an
 * isolated Obsidian instance with its own profile directory, so the user's running Obsidian and vaults are
 * untouched. Checks the app version, enable, command, view mount, settings, unmount on disable, reload and runtime errors.
 *
 * Needs a desktop session. OBSIDIAN_BIN is the launcher (default `obsidian`); OBSIDIAN_ASAR is the app package
 * of the target version (default ~/.config/obsidian/obsidian-<minAppVersion>.asar).
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
    const workspaceText = `document.querySelector('.obsibeans-workspace')?.textContent?.trim()`;

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
    await session.waitFor(`${workspaceText} === ${JSON.stringify(en['workspace.notBound'])}`, 'the workspace view');
    await session.evaluate(`app.commands.executeCommandById(${id} + ':open-workspace')`);
    await delay(500);
    check(await session.evaluate(`document.querySelectorAll('.obsibeans-workspace').length === 1`), 'the open command opens one workspace tab and reuses it');

    const settingsText = await session.evaluate(`(app.setting.open(), app.setting.openTabById(${id}), await new Promise(requestAnimationFrame), app.setting.activeTab?.containerEl.textContent ?? '')`);
    await session.evaluate(`app.setting.close()`);
    check(typeof settingsText === 'string' && settingsText.includes(en['settings.project.heading']) && settingsText.includes(en['settings.project.notBound']),
      'the settings tab renders the declared project settings');

    await session.evaluate(`app.plugins.disablePlugin(${id})`);
    check(await session.evaluate(`!app.plugins.plugins[${id}] && !document.querySelector('.obsibeans-workspace')`), 'disabling unloads the plugin and unmounts the workspace');

    await session.evaluate(`app.plugins.enablePlugin(${id})`);
    await session.evaluate(`app.commands.executeCommandById(${id} + ':open-workspace')`);
    await session.waitFor(`${workspaceText} === ${JSON.stringify(en['workspace.notBound'])}`, 'the workspace view after reload');
    check(true, 'the plugin reloads and opens the workspace again');

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
