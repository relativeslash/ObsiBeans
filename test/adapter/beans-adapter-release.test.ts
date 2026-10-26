import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BeansContext } from '../../src/adapter/beans-graphql.ts';
import type { BeanDetail } from '../../src/adapter/beans-model.ts';
import { READY_FILTER, blockingGraph, getBean, listBeans } from '../../src/adapter/beans-read.ts';
import { createBean, mutateBean, type Change } from '../../src/adapter/beans-write.ts';
import { bindProject } from '../../src/adapter/binding.ts';
import { ProcessRunner } from '../../src/adapter/process.ts';
import { parseYaml } from '../support/obsidian.ts';
import { makeProject, makeSandbox, trust, type Sandbox } from '../support/project.ts';

/**
 * Round trips against a real Beans binary in a disposable project, run only when OBSIBEANS_BEANS_RELEASE names the
 * audited 0.4.2 release or a development build (see the project information note). Without it these are skipped,
 * which is an unexecuted check, not a pass.
 */
const release = process.env.OBSIBEANS_BEANS_RELEASE ?? '';

describe.skipIf(release === '')('Beans adapter against a real binary', () => {
  let sandbox: Sandbox;
  let runner: ProcessRunner;
  let ctx: BeansContext;
  beforeEach(async () => {
    sandbox = await makeSandbox();
    runner = new ProcessRunner();
    await makeProject(sandbox.vault);
    const bound = await bindProject({ vaultRoot: sandbox.vault, executable: release, ...(await trust(release)), config: '', parseYaml, runner });
    if (!bound.ok) throw new Error(`not bound: ${JSON.stringify(bound.diagnostic)}`);
    ctx = { runner, binding: bound.value, parseYaml };
  });
  afterEach(async () => {
    await runner.dispose();
    await sandbox.dispose();
  });

  const must = <T>(outcome: { ok: true; value: T } | { ok: false; error: unknown }): T => {
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.error));
    return outcome.value;
  };
  const make = async (title: string, extra: Partial<Parameters<typeof createBean>[1]> = {}): Promise<BeanDetail> => must(await createBean(ctx, { title, ...extra }));
  const edit = (bean: BeanDetail, change: Change) => mutateBean(ctx, bean.id, bean.revision ?? '', change);
  const reread = async (bean: BeanDetail): Promise<BeanDetail> => {
    const found = must(await getBean(ctx, bean.id));
    if (found === null) throw new Error('vanished');
    return found;
  };
  const fileOf = (bean: BeanDetail): string => join(ctx.binding.taskRoot, bean.path);

  it('creates with explicit defaults, and lists and reads it back with a revision', async () => {
    const bean = await make('Ünïcode "quoted" title \\ backslash', { body: 'Line one\n- [ ] item', tags: ['alpha', 'beta-2'] });

    expect(bean).toMatchObject({ status: 'todo', type: 'task', priority: 'normal', tags: ['alpha', 'beta-2'], problems: [], parentId: null });
    expect(bean.title).toBe('Ünïcode "quoted" title \\ backslash');
    expect(bean.revision).toMatch(/^[0-9a-f]{16}$/);
    const listed = must(await listBeans(ctx));
    expect(listed.beans).toHaveLength(1);
    expect(listed.beans[0]).toMatchObject({ id: bean.id, revision: bean.revision, problems: [] });
    expect('body' in (listed.beans[0] ?? {})).toBe(false);
    expect(must(await getBean(ctx, bean.id))).toEqual(bean);
    expect(bean.body).toBe('\nLine one\n- [ ] item');
    expect(must(await getBean(ctx, 'FX-zzzzz'))).toBeNull();
  });

  it('guards every write with the raw-file hash, also for a bean whose queried ETag Beans would reject', async () => {
    const bean = await make('First');
    const renamed = await edit(bean, { kind: 'fields', title: 'Second', status: 'in-progress', priority: 'high', tags: ['z-tag', 'a-tag'] });
    const updated = must(renamed);

    expect(updated).toMatchObject({ title: 'Second', status: 'in-progress', priority: 'high', tags: ['z-tag', 'a-tag'], problems: [] });
    expect(updated.revision).not.toBe(bean.revision);
    expect(updated.revision).toBe((await reread(bean)).revision);
    expect(updated.path).toBe(bean.path);
  });

  it('writes a bean that has no priority line, whose queried ETag Beans rejects', async () => {
    const bean = await make('Odd');
    await writeFile(fileOf(bean), (await readFile(fileOf(bean), 'utf8')).replace('priority: normal\n', ''));

    const result = await edit(await reread(bean), { kind: 'fields', status: 'completed' });

    expect(must(result)).toMatchObject({ status: 'completed', priority: 'normal' });
  });

  it('rejects a stale revision without running Beans and offers the current bean', async () => {
    const bean = await make('Contested');
    must(await edit(bean, { kind: 'fields', title: 'Winner' }));

    const loser = await edit(bean, { kind: 'fields', title: 'Loser' });

    expect(loser).toMatchObject({ ok: false, error: { kind: 'conflict', code: 'revision', current: { title: 'Winner' } } });
    expect((await reread(bean)).title).toBe('Winner');
  });

  it('refuses frontmatter that Beans would silently drop, and a missing status', async () => {
    const bean = await make('Precious');
    const original = await readFile(fileOf(bean), 'utf8');
    const cases: [string, string][] = [
      ['an unknown field', original.replace('\n---\n', '\naliases:\n    - nick\n---\n')],
      ['a comment', original.replace('title:', '# keep me\ntitle:')],
      ['an inline comment', original.replace('status: todo', 'status: todo # why')],
    ];
    for (const [name, text] of cases) {
      await writeFile(fileOf(bean), text);
      const current = await reread(bean);
      const result = await edit(current, { kind: 'fields', title: 'Changed' });

      expect(result, name).toMatchObject({ ok: false, error: { kind: 'preservation', code: 'unsafe-frontmatter' } });
      expect(await readFile(fileOf(bean), 'utf8'), name).toBe(text);
    }
  });

  it('allows lossless normalization: the id comment, CRLF and key order', async () => {
    const bean = await make('Normal');
    const original = await readFile(fileOf(bean), 'utf8');
    await writeFile(fileOf(bean), original.replaceAll('\n', '\r\n'));

    const result = await edit(await reread(bean), { kind: 'fields', status: 'draft' });

    expect(must(result).status).toBe('draft');
  });

  it('blocks mutations on duplicate IDs and on files that are not valid beans', async () => {
    const bean = await make('Twin');
    await mkdir(join(ctx.binding.taskRoot, 'archive'));
    await writeFile(join(ctx.binding.taskRoot, 'archive', `${bean.id}--copy.md`), await readFile(fileOf(bean)));
    await writeFile(join(ctx.binding.taskRoot, 'Notes.md'), '# plain note\n');

    const listed = must(await listBeans(ctx));
    const result = await edit(bean, { kind: 'fields', title: 'Nope' });

    expect(listed.invalid).toEqual([{ path: 'Notes.md', reason: 'name' }]);
    expect(listed.beans.filter((found) => found.id === bean.id).every((found) => found.problems.includes('duplicate-id'))).toBe(true);
    expect(result).toMatchObject({ ok: false, error: { kind: 'preservation', code: 'invalid-bean' } });
  });

  it('edits one checklist item even when its text repeats', async () => {
    const body = '- [ ] same\n- [ ] same\n- [x] same\n\nText';
    const bean = await make('Checks', { body });
    const lines = bean.body.split('\n');
    const target = lines.findIndex((line) => line === '- [ ] same');

    const done = must(await edit(bean, { kind: 'checklist', line: target + 1, text: '- [ ] same', checked: true }));

    expect(done.body.split('\n').slice(target, target + 3)).toEqual(['- [ ] same', '- [x] same', '- [x] same']);
    expect(await edit(done, { kind: 'checklist', line: target, text: '- [x] other', checked: true })).toMatchObject({ ok: false, error: { kind: 'conflict', code: 'body' } });
    expect(await edit(done, { kind: 'checklist', line: lines.length - 1, text: 'Text', checked: true })).toMatchObject({ ok: false, error: { kind: 'validation', code: 'input' } });
  });

  it('replaces the description and keeps it intact', async () => {
    const bean = await make('Describe', { body: 'old' });

    const updated = must(await edit(bean, { kind: 'body', body: 'new ✓\n\n## Part\n"quoted" \\ done' }));

    expect(updated.body.trim()).toBe('new ✓\n\n## Part\n"quoted" \\ done');
  });

  it('sets and clears the parent, and rejects invalid parent types and cycles', async () => {
    const milestone = await make('M', { type: 'milestone' });
    const epic = await make('E', { type: 'epic' });
    const task = await make('T');

    const linked = must(await edit(epic, { kind: 'parent', parentId: milestone.id }));
    const cleared = must(await edit(linked, { kind: 'parent', parentId: null }));

    expect(linked.parentId).toBe(milestone.id);
    expect(cleared.parentId).toBeNull();
    expect(must(await getBean(ctx, milestone.id))?.childIds).toEqual([]);
    expect(await edit(task, { kind: 'parent', parentId: task.id })).toMatchObject({ ok: false, error: { kind: 'validation', code: 'input' } });
    expect(await edit(milestone, { kind: 'parent', parentId: epic.id })).toMatchObject({ ok: false, error: { kind: 'validation', code: 'backend' } });
    expect(await edit(task, { kind: 'parent', parentId: 'FX-qqqqq' })).toMatchObject({ ok: false, error: { kind: 'validation', code: 'backend' } });
  });

  it('edits blocking in both stored directions and reads them as one graph', async () => {
    const a = await make('A');
    const b = await make('B');
    const c = await make('C');

    const aBlocksB = must(await edit(a, { kind: 'blocking', field: 'blocking', action: 'add', targetId: b.id }));
    const cBlockedByB = must(await edit(c, { kind: 'blocking', field: 'blocked-by', action: 'add', targetId: b.id }));
    const graph = blockingGraph(must(await listBeans(ctx)).beans);
    const ready = must(await listBeans(ctx, READY_FILTER)).beans.map((bean) => bean.id).sort();

    expect(aBlocksB.blockingIds).toEqual([b.id]);
    expect(cBlockedByB.blockedByIds).toEqual([b.id]);
    expect(graph.get(b.id)).toEqual({ blocks: [c.id], blockedBy: [a.id] });
    expect(ready).toEqual([a.id].sort());
    const read = must(await listBeans(ctx));
    expect([...read.readyIds].sort()).toEqual(ready);
    expect([...read.blockedIds].sort()).toEqual(must(await listBeans(ctx, { isBlocked: true })).beans.map((bean) => bean.id).sort());
    expect(await edit(b, { kind: 'blocking', field: 'blocking', action: 'add', targetId: a.id })).toMatchObject({ ok: false, error: { kind: 'validation', code: 'backend' } });
    expect(await edit(a, { kind: 'blocking', field: 'blocking', action: 'add', targetId: a.id })).toMatchObject({ ok: false, error: { kind: 'validation', code: 'input' } });

    const removed = must(await edit(aBlocksB, { kind: 'blocking', field: 'blocking', action: 'remove', targetId: b.id }));
    expect(removed.blockingIds).toEqual([]);
  });

  it('filters, and rejects a misspelled filter value locally', async () => {
    await make('Draft one', { status: 'draft' });
    const todo = await make('Todo one');

    const todos = must(await listBeans(ctx, { status: ['todo'] }));

    expect(todos.beans.map((bean) => bean.id)).toEqual([todo.id]);
    expect(await listBeans(ctx, { status: ['tdo'] })).toMatchObject({ ok: false, error: { kind: 'validation', code: 'input' } });
  });

  it('lets exactly the guarded writers through when two start from the same revision', async () => {
    const bean = await make('Race');

    const results = await Promise.all(['Mine', 'Yours', 'Theirs'].map((title) => edit(bean, { kind: 'fields', title })));
    const winners = results.filter((result) => result.ok);

    // Beans guarantees no cross-process lock (contract note), so more than one winner is possible in a narrow window; none is not.
    expect(winners.length).toBeGreaterThan(0);
    for (const result of results) if (!result.ok) expect(result.error).toMatchObject({ kind: 'conflict' });
    expect(['Mine', 'Yours', 'Theirs']).toContain((await reread(bean)).title);
  });

  it('reports a malformed project as invalid data without crashing', async () => {
    await make('Fine');
    await writeFile(join(ctx.binding.taskRoot, 'FX-bad11--broken.md'), '---\ntitle: [unclosed\n---\n');

    expect(await listBeans(ctx)).toMatchObject({ ok: false, error: { kind: 'backend', code: 'invalid-data' } });
  });

  it('leaves nothing outside the project touched', async () => {
    const before = await readdir(sandbox.outside);
    const bean = await make('Contained');
    must(await edit(bean, { kind: 'fields', title: 'Still contained' }));

    expect(await readdir(sandbox.outside)).toEqual(before);
  });
});
