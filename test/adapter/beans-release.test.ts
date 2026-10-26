import { mkdir, readdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindProject, runBeans, type Binding, type BindingRequest } from '../../src/adapter/binding.ts';
import { ProcessRunner } from '../../src/adapter/process.ts';
import { scanTaskRoot } from '../../src/adapter/task-root.ts';
import { parseYaml } from '../support/obsidian.ts';
import { makeProject, makeSandbox, trust, type Sandbox } from '../support/project.ts';

/**
 * Runs against the audited Beans 0.4.2 release binary in a disposable project (see the Beans 0.4.2 contract
 * note for how to obtain it). Set OBSIBEANS_BEANS_RELEASE to its absolute path; without it these tests are
 * skipped, which is an unexecuted check, not a pass.
 */
const release = process.env.OBSIBEANS_BEANS_RELEASE ?? '';

describe.skipIf(release === '')('Beans 0.4.2 release binary', () => {
  let sandbox: Sandbox;
  let runner: ProcessRunner;
  let binding: Binding;
  let outsideBefore: string[];
  beforeEach(async () => {
    sandbox = await makeSandbox();
    runner = new ProcessRunner();
    await makeProject(sandbox.vault);
    await writeFile(join(sandbox.outside, 'bystander.md'), 'must never be touched');
    outsideBefore = await readdir(sandbox.outside);
    const request: BindingRequest = { vaultRoot: sandbox.vault, executable: release, ...(await trust(release)), config: '', parseYaml, runner };
    const result = await bindProject(request);
    if (!result.ok) throw new Error(`not bound: ${JSON.stringify(result.diagnostic)}`);
    binding = result.value;
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await runner.dispose();
    await sandbox.dispose();
  });

  const create = async (title: string): Promise<string> => {
    const result = await runBeans(runner, binding, 'graphql', [
      `mutation { createBean(input: { title: "${title}", type: "task", status: "todo", priority: "normal" }) { id } }`,
    ]);
    if (result.kind !== 'exited' || result.code !== 0) throw new Error(JSON.stringify(result));
    return (JSON.parse(result.stdout) as { createBean: { id: string } }).createBean.id;
  };

  it('binds the release and finds the beans it creates, ignoring BEANS_PATH', async () => {
    vi.stubEnv('BEANS_PATH', sandbox.outside);
    const id = await create('First');

    const scan = await scanTaskRoot(binding.taskRoot, binding);

    expect(binding.version).toBe('0.4.2');
    expect(id).toMatch(/^FX-[0-9a-z]{5}$/);
    expect(scan).toMatchObject({ ok: true, scan: { files: [{ id }], invalid: [] } });
    expect(await readdir(sandbox.outside)).toEqual(outsideBefore);
  });

  it('reports strays and symbolic links as invalid data without following them', async () => {
    const id = await create('Second');
    await writeFile(join(binding.taskRoot, 'Meeting notes.md'), '# Notes\n');
    await mkdir(join(binding.taskRoot, 'archive'));
    await symlink(sandbox.outside, join(binding.taskRoot, 'archive', 'escape'));

    const scan = await scanTaskRoot(binding.taskRoot, binding);

    expect(scan).toMatchObject({
      ok: true,
      scan: {
        files: [{ id }],
        invalid: [{ path: 'Meeting notes.md', reason: 'name' }, { path: 'archive/escape', reason: 'symlink' }],
      },
    });
  });

  it('shows a malformed bean as a load failure the caller can classify', async () => {
    await writeFile(join(binding.taskRoot, 'FX-bad11--broken.md'), '---\ntitle: [unclosed\n---\n');

    const result = await runBeans(runner, binding, 'graphql', ['{ beans { id } }']);

    expect(result).toMatchObject({ kind: 'exited', code: 1 });
    expect((result as { stderr: string }).stderr).toContain('loading beans:');
  });

  it('cancels a real call and leaves nothing running', async () => {
    const controller = new AbortController();
    const run = runBeans(runner, binding, 'graphql', ['{ beans { id } }'], { signal: controller.signal });
    controller.abort();

    expect(['cancelled', 'exited']).toContain((await run).kind);
    expect(runner.activeCount).toBe(0);
    expect(await readdir(sandbox.outside)).toEqual(outsideBefore);
  });
});
