import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BeansContext } from '../../src/adapter/beans-graphql.ts';
import { PRIORITIES, STATUSES, TYPES, type BeanDetail } from '../../src/adapter/beans-model.ts';
import { getBean, listBeans } from '../../src/adapter/beans-read.ts';
import { createBean, mutateBean } from '../../src/adapter/beans-write.ts';
import { bindProject } from '../../src/adapter/binding.ts';
import { ProcessRunner } from '../../src/adapter/process.ts';
import type { BeansPort } from '../../src/state/model.ts';
import { WorkspaceState } from '../../src/state/workspace-state.ts';
import { parseYaml } from '../support/obsidian.ts';
import { makeProject, makeSandbox, trust, type Sandbox } from '../support/project.ts';

/**
 * Bulk editing end to end against a real Beans binary, run only when OBSIBEANS_BEANS_RELEASE is set (see the
 * project information note). Without it this is skipped, which is an unexecuted check, not a pass.
 */
const release = process.env.OBSIBEANS_BEANS_RELEASE ?? '';

describe.skipIf(release === '')('bulk editing against a real binary', () => {
  let sandbox: Sandbox;
  let runner: ProcessRunner;
  let ctx: BeansContext;
  let state: WorkspaceState;
  /** Every write that reached the port, in order. */
  let writes: string[];
  /** Per bean ID: what the port does instead of, or after, the real write. */
  let faults: Map<string, (revision: string) => Promise<'backend' | 'timeout-after-write' | undefined>>;

  beforeEach(async () => {
    sandbox = await makeSandbox();
    runner = new ProcessRunner();
    await makeProject(sandbox.vault);
    const bound = await bindProject({ vaultRoot: sandbox.vault, executable: release, ...(await trust(release)), config: '', parseYaml, runner });
    if (!bound.ok) throw new Error(`not bound: ${JSON.stringify(bound.diagnostic)}`);
    ctx = { runner, binding: bound.value, parseYaml };
    writes = [];
    faults = new Map();
    const port: BeansPort = {
      list: () => listBeans(ctx),
      get: (id) => getBean(ctx, id),
      create: (bean) => createBean(ctx, bean),
      mutate: async (id, revision, change) => {
        writes.push(id);
        const fault = await faults.get(id)?.(revision);
        if (fault === 'backend') return { ok: false, error: { kind: 'backend', code: 'failed', message: 'Beans went away' } };
        const result = await mutateBean(ctx, id, revision, change);
        // The write happened, but the answer was lost: the caller cannot know.
        return fault === 'timeout-after-write' ? { ok: false, error: { kind: 'uncertain', message: 'timed out', current: null, createdIds: [] } } : result;
      },
    };
    state = new WorkspaceState({
      port,
      vocabulary: { statuses: STATUSES, types: TYPES, priorities: PRIORITIES },
      defaults: { status: 'todo', type: 'task', priority: 'normal' },
      taskRoot: '',
      drafts: [],
      saveDrafts: () => Promise.resolve(),
      now: () => Date.now(),
      debounceMs: 10,
    });
    await state.start();
  });
  afterEach(async () => {
    await state.dispose();
    await runner.dispose();
    await sandbox.dispose();
  });

  const must = <T>(outcome: { ok: true; value: T } | { ok: false; error: unknown }): T => {
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.error));
    return outcome.value;
  };
  const make = async (title: string, type = 'task'): Promise<BeanDetail> => must(await createBean(ctx, { title, type }));
  const parentsOnDisk = async (): Promise<Record<string, string | null>> => Object.fromEntries(must(await listBeans(ctx)).beans.map((bean) => [bean.title, bean.parentId]));
  const kinds = (): Record<string, string> => Object.fromEntries((state.getSnapshot().bulk?.items ?? []).map((item) => [state.getSnapshot().beans.find((bean) => bean.id === item.id)?.title ?? item.id, item.kind]));

  it('shows an outcome per bean that matches the project on disk, and retries only what has no saved result', async () => {
    const epic = await make('epic', 'epic');
    const one = await make('one');
    const two = await make('two');
    const three = await make('three');
    const four = await make('four');
    const milestone = await make('milestone', 'milestone');
    await state.refresh();
    state.setSelected([one.id, two.id, three.id, four.id, milestone.id]);

    // `two` is edited elsewhere after the run starts, `three` loses the backend, `four` is written but never answers.
    faults.set(one.id, async () => {
      await appendFile(join(ctx.binding.taskRoot, two.path), '\nEdited elsewhere.\n');
      return undefined;
    });
    faults.set(three.id, () => Promise.resolve('backend'));
    faults.set(four.id, () => Promise.resolve('timeout-after-write'));

    await state.applyBulk({ field: 'parent', parentId: epic.id });

    expect(kinds()).toEqual({ one: 'saved', two: 'conflict', three: 'failed', four: 'uncertain', milestone: 'failed' });
    // The milestone was refused before Beans was called. The timed-out write did reach the file, which only a re-read shows.
    expect(writes).toEqual([one.id, two.id, three.id, four.id]);
    expect(await parentsOnDisk()).toEqual({ epic: null, one: epic.id, two: null, three: null, four: epic.id, milestone: null });

    faults.clear();
    state.reconcileBulk(four.id);
    await state.retryBulk();

    // `one` was saved and is never written again; `four` already has its parent, so the re-read spares it a second write.
    expect(writes).toEqual([one.id, two.id, three.id, four.id, two.id, three.id]);
    expect(kinds()).toEqual({ one: 'saved', two: 'saved', three: 'saved', four: 'unchanged', milestone: 'failed' });
    expect(await parentsOnDisk()).toEqual({ epic: null, one: epic.id, two: epic.id, three: epic.id, four: epic.id, milestone: null });
  });
});
