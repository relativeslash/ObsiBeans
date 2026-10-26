import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beansEnvironment,
  bindProject,
  configUnchanged,
  confirmExecutable,
  runBeans,
  SUPPORTED_BEANS_VERSION,
  type Binding,
  type BindingRequest,
} from '../../src/adapter/binding.ts';
import { ProcessRunner } from '../../src/adapter/process.ts';
import { parseYaml } from '../support/obsidian.ts';
import { PROJECT_CONFIG, makeProject, makeSandbox, trust, writeFakeBeans, type Sandbox } from '../support/project.ts';

let sandbox: Sandbox;
let runner: ProcessRunner;
beforeEach(async () => {
  sandbox = await makeSandbox();
  runner = new ProcessRunner();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await runner.dispose();
  await sandbox.dispose();
});

/** A fully valid request that each test then breaks in one way. */
async function validRequest(): Promise<BindingRequest> {
  await makeProject(sandbox.vault);
  const executable = await writeFakeBeans(sandbox.outside);
  return { vaultRoot: sandbox.vault, executable, ...(await trust(executable)), config: '', parseYaml, runner };
}

async function diagnosticOf(request: BindingRequest): Promise<unknown> {
  const result = await bindProject(request);
  return result.ok ? result : result.diagnostic;
}

async function bound(request: BindingRequest): Promise<Binding> {
  const result = await bindProject(request);
  if (!result.ok) throw new Error(`not bound: ${JSON.stringify(result.diagnostic)}`);
  return result.value;
}

describe('bindProject', () => {
  it('binds a project with a non-default task path in a vault path with spaces', async () => {
    const request = await validRequest();

    expect(await bound(request)).toEqual({
      executable: request.executable,
      configPath: join(sandbox.vault, '.beans.yml'),
      projectDir: sandbox.vault,
      taskRoot: join(sandbox.vault, 'Task root'),
      taskRootInVault: 'Task root',
      configInVault: '.beans.yml',
      configDigest: createHash('sha256').update(PROJECT_CONFIG).digest('hex'),
      prefix: 'FX-',
      idLength: 5,
      defaults: { status: 'todo', type: 'task' },
      version: SUPPORTED_BEANS_VERSION,
      verified: true,
    });
  });

  it('applies the Beans defaults for a missing prefix and id length', async () => {
    const request = await validRequest();
    await makeProject(sandbox.vault, 'beans:\n    path: Task root\n');

    expect(await bound(request)).toMatchObject({ prefix: '', idLength: 4 });
  });

  it('reads the creation defaults, and falls back to todo and task (not the CLI\'s milestone)', async () => {
    const request = await validRequest();
    expect((await bound(request)).defaults).toEqual({ status: 'todo', type: 'task' });

    await makeProject(sandbox.vault, 'beans:\n    path: Task root\n    default_status: draft\n    default_type: bug\n');

    expect((await bound(request)).defaults).toEqual({ status: 'draft', type: 'bug' });
  });

  it('binds an explicit config in a subfolder and resolves its task path from that folder', async () => {
    const request = await validRequest();
    await mkdir(join(sandbox.vault, 'project', 'beans data'), { recursive: true });
    await writeFile(join(sandbox.vault, 'project', 'tracker.yml'), 'beans:\n    path: beans data\n');

    const binding = await bound({ ...request, config: 'project/tracker.yml' });

    expect(binding.projectDir).toBe(join(sandbox.vault, 'project'));
    expect(binding.taskRoot).toBe(join(sandbox.vault, 'project', 'beans data'));
    expect([binding.taskRootInVault, binding.configInVault]).toEqual(['project/beans data', 'project/tracker.yml']);
  });

  it('notices that the config file changed or vanished since it was bound', async () => {
    const request = await validRequest();
    const binding = await bound(request);
    expect(await configUnchanged(binding)).toBe(true);

    await writeFile(binding.configPath, `${PROJECT_CONFIG}# edited\n`);
    expect(await configUnchanged(binding)).toBe(false);

    await writeFile(binding.configPath, PROJECT_CONFIG);
    expect(await configUnchanged(binding)).toBe(true);

    await rm(binding.configPath);
    expect(await configUnchanged(binding)).toBe(false);
  });

  describe('executable', () => {
    it('requires an entry', async () => {
      expect(await diagnosticOf({ ...(await validRequest()), executable: '' })).toEqual({ code: 'executable-not-set' });
    });

    it('requires an absolute path, so PATH never decides what runs', async () => {
      expect(await diagnosticOf({ ...(await validRequest()), executable: 'beans' })).toEqual({ code: 'executable-not-absolute', path: 'beans' });
    });

    it('reports a missing file and a folder', async () => {
      const request = await validRequest();
      const missing = join(sandbox.outside, 'nope');

      expect(await diagnosticOf({ ...request, executable: missing })).toEqual({ code: 'executable-missing', path: missing });
      expect(await diagnosticOf({ ...request, executable: sandbox.outside })).toEqual({ code: 'executable-not-file', path: sandbox.outside });
    });

    it('reports a file without execute permission', async () => {
      const request = await validRequest();
      const plain = join(sandbox.outside, 'plain');
      await writeFile(plain, 'x');
      await chmod(plain, 0o644);

      expect(await diagnosticOf({ ...request, executable: plain, ...(await trust(plain)) })).toEqual({ code: 'executable-permission', path: plain });
    });

    it('refuses an executable inside the vault, even a confirmed one or a symlink to it', async () => {
      const request = await validRequest();
      const inside = await writeFakeBeans(sandbox.vault);
      const link = join(sandbox.outside, 'link');
      await symlink(inside, link);

      expect(await diagnosticOf({ ...request, executable: inside, ...(await trust(inside)) })).toEqual({ code: 'executable-in-vault', path: inside });
      expect(await diagnosticOf({ ...request, executable: link, ...(await trust(inside)) })).toEqual({ code: 'executable-in-vault', path: link });
    });

    it('is untrusted until the exact real file was confirmed', async () => {
      const request = await validRequest();
      const other = await writeFakeBeans(sandbox.outside, 'beans 0.4.2 (other) built now', 'other');
      const link = join(sandbox.outside, 'link');
      await symlink(request.executable, link);

      expect(await diagnosticOf({ ...request, confirmedExecutable: '', confirmedDigest: '' })).toEqual({ code: 'executable-untrusted', path: request.executable });
      expect(await diagnosticOf({ ...request, ...(await trust(other)) })).toEqual({ code: 'executable-untrusted', path: request.executable });
      expect(await bound({ ...request, executable: link })).toMatchObject({ executable: request.executable });

      await symlink(other, link + '2');
      expect(await diagnosticOf({ ...request, executable: link + '2' })).toEqual({ code: 'executable-untrusted', path: other });
    });

    it('withdraws trust when the confirmed file is replaced, and restores it on confirming again', async () => {
      const request = await validRequest();
      await writeFile(request.executable, `#!${process.execPath}\nconsole.log('beans 0.4.2 (replaced) built now')\n`);

      expect(await diagnosticOf(request)).toEqual({ code: 'executable-changed', path: request.executable });

      const again = await confirmExecutable(request.executable, sandbox.vault);
      expect(again.ok && again.value).toEqual({ path: request.executable, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) as string });
      expect(await bound({ ...request, ...(await trust(request.executable)) })).toMatchObject({ version: '0.4.2' });
    });

    it('binds a development build and marks it unverified, but the audited release as verified', async () => {
      const request = await validRequest();
      const dev = await writeFakeBeans(sandbox.outside, 'beans dev (unknown) built unknown', 'dev-beans');

      expect(await bound(request)).toMatchObject({ version: '0.4.2', verified: true });
      expect(await bound({ ...request, executable: dev, ...(await trust(dev)) })).toMatchObject({ version: 'dev', verified: false, executable: dev });
    });

    it('rejects any other version, without trusting a lookalike line', async () => {
      const request = await validRequest();
      for (const line of ['beans 0.4.1 (x) built now', 'beans 0.4.3 (x) built now', 'beans 0.4.20', 'beans developer', 'something else', '']) {
        const executable = await writeFakeBeans(sandbox.outside, line, `v-${String(line.length)}`);

        expect(await diagnosticOf({ ...request, executable, ...(await trust(executable)) })).toEqual({
          code: 'executable-unsupported-version',
          found: line,
          supported: SUPPORTED_BEANS_VERSION,
        });
      }
    });

    it('reports a program that fails or never answers the version probe', async () => {
      const request = await validRequest();
      const failing = join(sandbox.outside, 'failing');
      await writeFile(failing, `#!${process.execPath}\nprocess.exit(7)\n`);
      await chmod(failing, 0o755);
      const broken = join(sandbox.outside, 'broken');
      await writeFile(broken, '#!/nonexistent/interpreter\n');
      await chmod(broken, 0o755);

      expect(await diagnosticOf({ ...request, executable: failing, ...(await trust(failing)) })).toEqual({
        code: 'executable-failed',
        reason: 'exit',
        detail: 'exit code 7',
      });
      expect(await diagnosticOf({ ...request, executable: broken, ...(await trust(broken)) })).toMatchObject({ code: 'executable-failed', reason: 'spawn' });
    });

    it('reports a cancelled probe when the runner is released', async () => {
      const request = await validRequest();
      await runner.dispose();

      expect(await diagnosticOf(request)).toEqual({ code: 'executable-failed', reason: 'cancelled', detail: '' });
    });

    it('does not run an untrusted or in-vault executable at all', async () => {
      const request = await validRequest();
      const marker = join(sandbox.outside, 'ran');
      const trap = join(sandbox.outside, 'trap');
      await writeFile(trap, `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')\n`);
      await chmod(trap, 0o755);

      await bindProject({ ...request, executable: trap, confirmedExecutable: '', confirmedDigest: '' });
      await bindProject({ ...request, executable: trap, ...(await trust(trap)), config: 'missing.yml' });

      await expect(readFile(marker)).rejects.toThrow();
    });
  });

  describe('project configuration', () => {
    it('reports a missing config', async () => {
      const request = await validRequest();

      expect(await diagnosticOf({ ...request, config: 'nope/.beans.yml' })).toEqual({ code: 'config-missing', path: 'nope/.beans.yml' });
      await makeProject(sandbox.vault);
      await rm(join(sandbox.vault, '.beans.yml'));
      expect(await diagnosticOf(request)).toEqual({ code: 'config-missing', path: '.beans.yml' });
    });

    it('refuses a config outside the vault, by traversal, absolute path or symlink', async () => {
      const request = await validRequest();
      await writeFile(join(sandbox.outside, 'evil.yml'), 'beans:\n    path: x\n');
      await symlink(join(sandbox.outside, 'evil.yml'), join(sandbox.vault, 'linked.yml'));

      for (const config of ['../outside/evil.yml', join(sandbox.outside, 'evil.yml'), 'linked.yml']) {
        expect(await diagnosticOf({ ...request, config })).toEqual({ code: 'config-outside-vault', path: config });
      }
    });

    it.each([
      ['a folder', null, 'not a file'],
      ['a parse failure', 'boom', 'boom'],
      ['a missing beans section', 'other: 1\n', 'missing the beans section'],
      ['an empty document', '', 'missing the beans section'],
      ['a missing path', 'beans:\n    prefix: FX-\n', 'beans.path must be a non-empty string'],
      ['a non-string path', 'beans:\n    path: 12\n', 'beans.path must be a non-empty string'],
      ['a numeric prefix', 'beans:\n    path: t\n    prefix: 5\n', 'beans.prefix must be a string'],
      ['a zero id length', 'beans:\n    path: t\n    id_length: 0\n', 'beans.id_length must be a whole number from 1 to 64'],
      ['a huge id length', 'beans:\n    path: t\n    id_length: 65\n', 'beans.id_length must be a whole number from 1 to 64'],
      ['a text id length', 'beans:\n    path: t\n    id_length: many\n', 'beans.id_length must be a whole number from 1 to 64'],
      ['an unknown default status', 'beans:\n    path: t\n    default_status: wip\n', 'beans.default_status must be one of in-progress, todo, draft, completed, scrapped'],
      ['an unknown default type', 'beans:\n    path: t\n    default_type: story\n', 'beans.default_type must be one of milestone, epic, bug, feature, task'],
      ['an oversized file', `beans:\n    path: t\n${'#'.repeat(70_000)}\n`, 'file is too large'],
    ] as const)('rejects %s', async (_name, content, detail) => {
      const request = await validRequest();
      if (content === null) {
        await rm(join(sandbox.vault, '.beans.yml'));
        await mkdir(join(sandbox.vault, '.beans.yml'));
      } else await writeFile(join(sandbox.vault, '.beans.yml'), content);
      const throwing = content === 'boom' ? (): never => { throw new Error('boom'); } : parseYaml;

      expect(await diagnosticOf({ ...request, parseYaml: throwing })).toEqual({ code: 'config-invalid', path: '.beans.yml', detail });
    });

    it.skipIf(process.getuid?.() === 0)('reports a config the plugin may not read, with the permission error', async () => {
      const request = await validRequest();
      await chmod(join(sandbox.vault, '.beans.yml'), 0o000);

      expect(await diagnosticOf(request)).toMatchObject({ code: 'config-invalid', path: '.beans.yml', detail: expect.stringContaining('EACCES') as string });
    });

    it('describes a parser that throws a non-error', async () => {
      const request = await validRequest();

      expect(await diagnosticOf({ ...request, parseYaml: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- JavaScript can throw non-errors (TSE-ERR-003)
        throw 'bad';
      } })).toEqual({ code: 'config-invalid', path: '.beans.yml', detail: 'not valid YAML' });
    });
  });

  describe('task root', () => {
    async function withPath(request: BindingRequest, path: string): Promise<BindingRequest> {
      await writeFile(join(sandbox.vault, '.beans.yml'), `beans:\n    path: ${path}\n`);
      return request;
    }

    it('reports a missing task root and a file in its place', async () => {
      const request = await validRequest();
      await writeFile(join(sandbox.vault, 'afile'), 'x');

      expect(await diagnosticOf(await withPath(request, 'absent'))).toEqual({ code: 'task-root-missing', path: 'absent' });
      expect(await diagnosticOf(await withPath(request, 'afile'))).toEqual({ code: 'task-root-not-directory', path: 'afile' });
    });

    it('refuses a task root outside the vault, by traversal, absolute path or symlink', async () => {
      const request = await validRequest();
      await symlink(sandbox.outside, join(sandbox.vault, 'escape'));

      for (const path of ['../outside', sandbox.outside, 'escape', 'Task root/../../outside']) {
        expect(await diagnosticOf(await withPath(request, path))).toEqual({ code: 'task-root-outside-vault', path });
      }
    });

    it('accepts a task root that is a symlink to a folder inside the vault, using its real path', async () => {
      const request = await validRequest();
      await symlink(join(sandbox.vault, 'Task root'), join(sandbox.vault, 'alias'));

      expect(await bound(await withPath(request, 'alias'))).toMatchObject({ taskRoot: join(sandbox.vault, 'Task root') });
    });
  });

  it('turns an unexpected file system failure into a diagnostic instead of a rejection', async () => {
    const request = await validRequest();

    expect(await diagnosticOf({ ...request, vaultRoot: join(sandbox.outside, 'no such vault') })).toMatchObject({
      code: 'binding-failed',
      detail: expect.stringContaining('ENOENT') as string,
    });
  });
});

describe('confirmExecutable', () => {
  it('returns the real path to remember', async () => {
    const executable = await writeFakeBeans(sandbox.outside);
    const link = join(sandbox.outside, 'link');
    await symlink(executable, link);

    expect(await confirmExecutable(link, sandbox.vault)).toEqual({ ok: true, value: { path: executable, sha256: (await trust(executable)).confirmedDigest } });
  });

  it('applies the same checks as binding and never runs the file', async () => {
    const trap = join(sandbox.outside, 'trap');
    await writeFile(trap, `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(join(sandbox.outside, 'ran'))}, 'ran')\n`);
    await chmod(trap, 0o755);

    expect(await confirmExecutable(trap, sandbox.vault)).toMatchObject({ ok: true, value: { path: trap } });
    expect(await confirmExecutable('', sandbox.vault)).toEqual({ ok: false, diagnostic: { code: 'executable-not-set' } });
    expect(await confirmExecutable(join(sandbox.vault, 'x'), sandbox.vault)).toMatchObject({ ok: false });
    await expect(readFile(join(sandbox.outside, 'ran'))).rejects.toThrow();
  });
});

describe('runBeans', () => {
  it('runs against the bound project only: explicit config, project directory, no BEANS_PATH, JSON output', async () => {
    vi.stubEnv('BEANS_PATH', sandbox.outside);
    vi.stubEnv('beans_path', sandbox.outside);
    const binding = await bound(await validRequest());

    const result = await runBeans(runner, binding, 'graphql', ['-v', '{"id":"x"}', '{ beans { id } }; $(touch pwned)']);

    expect(result).toMatchObject({ kind: 'exited', code: 0 });
    expect(JSON.parse((result as { stdout: string }).stdout)).toEqual({
      argv: ['--config', binding.configPath, 'graphql', '--json', '-v', '{"id":"x"}', '{ beans { id } }; $(touch pwned)'],
      cwd: sandbox.vault,
      beansPath: null,
    });
  });

  it('honors cancellation and a custom deadline', async () => {
    const binding = await bound(await validRequest());

    expect(await runBeans(runner, binding, 'list', [], { signal: AbortSignal.abort() })).toEqual({ kind: 'cancelled' });
    expect(await runBeans(runner, binding, 'list', [], { timeoutMs: 5_000 })).toMatchObject({ kind: 'exited' });
  });
});

describe('beansEnvironment', () => {
  it('drops BEANS_PATH in any letter case and undefined values, and keeps the rest', () => {
    expect(beansEnvironment({ BEANS_PATH: '/x', Beans_Path: '/y', HOME: '/home/a', GONE: undefined })).toEqual({ HOME: '/home/a' });
  });
});
