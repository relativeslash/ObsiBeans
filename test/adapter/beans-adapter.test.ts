import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { classifyMessage, type BeansContext } from '../../src/adapter/beans-graphql.ts';
import { fnv1a64 } from '../../src/adapter/beans-guard.ts';
import type { AdapterError, BeanSummary, Outcome } from '../../src/adapter/beans-model.ts';
import { READY_FILTER, blockingGraph, getBean, listBeans, readiness } from '../../src/adapter/beans-read.ts';
import { createBean, mutateBean, type Change } from '../../src/adapter/beans-write.ts';
import { bindProject } from '../../src/adapter/binding.ts';
import { ProcessRunner } from '../../src/adapter/process.ts';
import { parseYaml } from '../support/obsidian.ts';
import { callsOf, makeProject, makeSandbox, script, trust, writeScriptedBeans, type Sandbox, type Step } from '../support/project.ts';

let sandbox: Sandbox;
let runner: ProcessRunner;
let ctx: BeansContext;
let root: string;
beforeEach(async () => {
  sandbox = await makeSandbox();
  runner = new ProcessRunner();
  await makeProject(sandbox.vault);
  const executable = await writeScriptedBeans(sandbox.outside);
  const bound = await bindProject({ vaultRoot: sandbox.vault, executable, ...(await trust(executable)), config: '', parseYaml, runner });
  if (!bound.ok) throw new Error(`not bound: ${JSON.stringify(bound.diagnostic)}`);
  ctx = { runner, binding: bound.value, parseYaml, timeoutMs: 5_000 };
  root = bound.value.taskRoot;
});
afterEach(async () => {
  await runner.dispose();
  await sandbox.dispose();
});

const fileText = (id: string, title = 'T'): string =>
  `---\n# ${id}\ntitle: ${title}\nstatus: todo\ntype: task\npriority: normal\ncreated_at: 2026-10-26T20:00:00Z\nupdated_at: 2026-10-26T20:00:00Z\n---\n\nBody\n`;
/** Creates the bean file as Beans would and returns its path and revision. */
async function seed(id: string, text = fileText(id), name = `${id}--t.md`): Promise<{ path: string; file: string; revision: string }> {
  const file = join(root, name);
  await writeFile(file, text);
  return { path: name, file, revision: fnv1a64(await readFile(file)) };
}

/** A bean as Beans' GraphQL returns it. */
const gql = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  slug: 't',
  path: `${id}--t.md`,
  title: 'T',
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
  ...extra,
});
const detail = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ ...gql(id), body: '\nBody', ...extra });

const A = 'FX-aaaaa';
const B = 'FX-bbbbb';
const C = 'FX-ccccc';
const LIST = 'beans\\(filter';
const DETAIL = 'query\\(\\$id: ID!\\) \\{ bean\\(id: \\$id\\) \\{ id';
const BODY = '\\{ bean\\(id: \\$id\\) \\{ body \\}';
const reading = (id: string, extra: Record<string, unknown> = {}): Step => ({ when: DETAIL, stdout: { bean: detail(id, extra) } });

function expectError(outcome: Outcome<unknown>): AdapterError {
  if (outcome.ok) throw new Error('expected a failure');
  return outcome.error;
}
function expectValue<T>(outcome: Outcome<T>): T {
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.error));
  return outcome.value;
}

describe('classifyMessage', () => {
  it.each([
    ['Error: graphql: etag mismatch: provided a, current is b\nUsage:', 'etag'],
    ['Error: graphql: if-match etag is required (set require_if_match: false in config to disable)', 'etag'],
    ['Error: graphql: replacement 0 failed: text found 2 times in body (must be unique)', 'body'],
    ['Error: graphql: epic beans can only have milestone as parent, not epic', 'validation'],
    ['Error: graphql: adding the link would create cycle', 'validation'],
    ['Error: graphql: bean not found', 'validation'],
    ['Error: graphql: milestone beans cannot have a parent', 'validation'],
    ['Error: loading beans: loading x.md: parsing front matter: bad', 'invalid-data'],
    ['Error: graphql: writing file: permission denied', 'write-failed'],
    ['Error: graphql: something unforeseen', 'failed'],
    ['panic: nothing like an error line', 'failed'],
    ['', 'failed'],
  ])('%s -> %s', (stderr, reason) => {
    expect(classifyMessage(stderr).reason).toBe(reason);
  });
});

describe('listBeans', () => {
  it('combines Beans data with the files: revisions, problems and invalid files', async () => {
    const good = await seed(A);
    const dup = await seed(C);
    await mkdir(join(root, 'archive'));
    await writeFile(join(root, 'archive', `${C}--copy.md`), fileText(C));
    await mkdir(join(root, 'sub'));
    const nested = await seed('FX-ddddd', fileText('FX-ddddd'), 'sub/FX-ddddd--t.md');
    await writeFile(join(root, 'Notes.md'), '# plain note\n');
    await seed('FX-eeeee');
    await script(sandbox.outside, [
      {
        when: LIST,
        stdout: {
          beans: [
            gql(A, { blockedBy: [{ id: B }], children: [{ id: C }], blockingIds: [B] }),
            gql(C),
            gql('FX-ddddd', { path: 'sub\\FX-ddddd--t.md' }),
            gql('Notes', { path: 'Notes.md', slug: null, title: '', status: '' }),
            gql('FX-eeeee', { status: 'wip' }),
            gql('FX-fffff', { tags: ['Bad Tag'] }),
          ],
        },
      },
    ]);

    const { beans, invalid } = expectValue(await listBeans(ctx));
    const byId = new Map(beans.map((bean) => [bean.id, bean]));

    expect(byId.get(A)).toMatchObject({ revision: good.revision, problems: [], blockedByLinkIds: [B], childIds: [C], blockingIds: [B], slug: 't' });
    expect(byId.get(C)).toMatchObject({ revision: dup.revision, problems: ['duplicate-id'] });
    expect(byId.get('FX-ddddd')).toMatchObject({ revision: nested.revision, path: 'sub/FX-ddddd--t.md', problems: [] });
    expect(byId.get('Notes')).toMatchObject({ revision: null, slug: '', problems: ['invalid-file', 'bad-value'] });
    expect(byId.get('FX-eeeee')?.problems).toEqual(['bad-value']);
    expect(byId.get('FX-fffff')?.problems).toEqual(['invalid-file', 'bad-value']);
    expect(invalid).toEqual([{ path: 'Notes.md', reason: 'name' }]);
    expect((await callsOf(sandbox.outside))[0]?.variables).toEqual({ filter: {} });
  });

  it.skipIf(process.getuid?.() === 0)('marks a bean whose file cannot be read', async () => {
    const { file } = await seed(A);
    await chmod(file, 0o000);
    await script(sandbox.outside, [{ stdout: { beans: [gql(A)] } }]);

    expect(expectValue(await listBeans(ctx)).beans[0]).toMatchObject({ revision: null, problems: ['unreadable'] });
  });

  it('reads more beans than one revision batch', async () => {
    const ids = Array.from({ length: 70 }, (_, index) => `FX-${index.toString(36).padStart(5, '0')}`);
    for (const id of ids) await seed(id);
    await script(sandbox.outside, [{ stdout: { beans: ids.map((id) => gql(id)) } }]);

    const { beans } = expectValue(await listBeans(ctx));

    expect(beans).toHaveLength(70);
    expect(beans.every((bean) => bean.problems.length === 0)).toBe(true);
  });

  it('passes the readiness filter through as a variable', async () => {
    await script(sandbox.outside, [{ stdout: { beans: [] } }]);

    expectValue(await listBeans(ctx, READY_FILTER));

    expect((await callsOf(sandbox.outside))[0]?.variables).toEqual({ filter: READY_FILTER });
  });

  it('rejects a misspelled filter value without running Beans', async () => {
    const error = expectError(await listBeans(ctx, { priority: ['urgent'] }));

    expect(error).toMatchObject({ kind: 'validation', code: 'input' });
    expect(await callsOf(sandbox.outside)).toEqual([]);
  });

  it.each([
    ['output that is not JSON', { stdout: 'not json' }, { kind: 'backend', code: 'invalid-response' }],
    ['a JSON array', { stdout: '[]' }, { kind: 'backend', code: 'invalid-response' }],
    ['data without the field', { stdout: {} }, { kind: 'backend', code: 'invalid-response' }],
    ['a field that is not a list', { stdout: { beans: 'x' } }, { kind: 'backend', code: 'invalid-response' }],
    ['a null bean', { stdout: { beans: [null] } }, { kind: 'backend', code: 'invalid-response' }],
    ['a numeric id', { stdout: { beans: [gql(A, { id: 5 })] } }, { kind: 'backend', code: 'invalid-response' }],
    ['a missing slug', { stdout: { beans: [{ ...gql(A), slug: undefined }] } }, { kind: 'backend', code: 'invalid-response' }],
    ['a non-string tag', { stdout: { beans: [gql(A, { tags: [1] })] } }, { kind: 'backend', code: 'invalid-response' }],
    ['a malformed file', { stderr: 'Error: loading beans: loading x.md: parsing front matter: bad\n', code: 1 }, { kind: 'backend', code: 'invalid-data' }],
    ['a backend error', { stderr: 'Error: graphql: boom\nUsage:\n', code: 1 }, { kind: 'backend', code: 'failed' }],
    ['a rejected query', { stderr: 'Error: graphql: bean not found\n', code: 1 }, { kind: 'validation', code: 'backend' }],
  ] as const)('reports %s', async (_name, step, expected) => {
    await script(sandbox.outside, [step]);

    expect(expectError(await listBeans(ctx))).toMatchObject(expected);
  });

  it('reports a timeout, a cancellation and a missing executable as different backend failures', async () => {
    await script(sandbox.outside, [{ sleepMs: 3_000, stdout: { beans: [] } }]);
    expect(expectError(await listBeans({ ...ctx, timeoutMs: 300 }))).toMatchObject({ kind: 'backend', code: 'timeout' });

    const controller = new AbortController();
    controller.abort();
    expect(expectError(await listBeans({ ...ctx, signal: controller.signal }))).toMatchObject({ kind: 'backend', code: 'cancelled' });

    expect(expectError(await listBeans({ ...ctx, binding: { ...ctx.binding, executable: join(sandbox.outside, 'missing') } }))).toMatchObject({
      kind: 'backend',
      code: 'unavailable',
    });
  });
});

describe('getBean', () => {
  it('reads one bean with its description', async () => {
    const { revision } = await seed(A);
    await script(sandbox.outside, [reading(A, { body: '\nHello' })]);

    expect(expectValue(await getBean(ctx, A))).toMatchObject({ id: A, body: '\nHello', revision, problems: [] });
    expect((await callsOf(sandbox.outside))[0]?.variables).toEqual({ id: A });
  });

  it('answers null for a bean that does not exist', async () => {
    await script(sandbox.outside, [{ stdout: { bean: null } }]);

    expect(expectValue(await getBean(ctx, A))).toBeNull();
  });

  it('refuses short or malformed IDs without running Beans, and an answer about another bean', async () => {
    for (const id of ['aaaaa', 'FX-aaa', 'FX-AAAAA', 'XX-aaaaa', 'FX-aaaa!']) {
      expect(expectError(await getBean(ctx, id))).toMatchObject({ kind: 'validation', code: 'input' });
    }
    expect(await callsOf(sandbox.outside)).toEqual([]);

    await script(sandbox.outside, [{ stdout: { bean: detail(B) } }]);
    expect(expectError(await getBean(ctx, A))).toMatchObject({ kind: 'backend', code: 'invalid-response' });
  });

  it('reports a body that is not text', async () => {
    await script(sandbox.outside, [{ stdout: { bean: { ...gql(A), body: 3 } } }]);

    expect(expectError(await getBean(ctx, A))).toMatchObject({ kind: 'backend', code: 'invalid-response' });
  });
});

describe('blockingGraph', () => {
  const bean = (id: string, extra: Partial<BeanSummary>): BeanSummary => ({ ...(gql(id) as unknown as BeanSummary), revision: null, problems: [], blockedByLinkIds: [], childIds: [], ...extra });

  it('merges links stored on either side', () => {
    const graph = blockingGraph([bean(A, { blockingIds: [B] }), bean(B, {}), bean(C, { blockedByIds: [B] })]);

    expect(graph.get(A)).toEqual({ blocks: [B], blockedBy: [] });
    expect(graph.get(B)).toEqual({ blocks: [C], blockedBy: [A] });
    expect(graph.get(C)).toEqual({ blocks: [], blockedBy: [B] });
  });
});

describe('readiness', () => {
  const bean = (id: string, extra: Partial<BeanSummary>): BeanSummary => ({ ...(gql(id) as unknown as BeanSummary), revision: null, problems: [], blockedByLinkIds: [], childIds: [], ...extra });

  it('blocks on an unfinished blocker stored on either side, and unblocks when it finishes or is scrapped', () => {
    const rows = [
      bean(A, { blockingIds: [B] }), // A blocks B
      bean(B, {}),
      bean(C, { blockedByIds: [A] }), // C waits for A
      bean('FX-ddddd', { status: 'completed' }),
      bean('FX-eeeee', { blockedByIds: ['FX-ddddd'] }), // its blocker is finished
      bean('FX-fffff', { blockedByIds: ['FX-ggggg'] }), // its blocker does not exist
      bean('FX-ggggg', { status: 'scrapped', blockingIds: ['FX-hhhhh'] }),
      bean('FX-hhhhh', {}),
    ];

    const { blockedIds, readyIds } = readiness(rows);

    expect([...blockedIds].sort()).toEqual([B, C]);
    expect([...readyIds].sort()).toEqual([A, 'FX-eeeee', 'FX-fffff', 'FX-hhhhh']);
  });

  it('never calls started, finished, scrapped or draft work ready, as `beans list --ready` does', () => {
    const rows = ['in-progress', 'completed', 'scrapped', 'draft', 'todo'].map((status, index) => bean(`FX-${String(index).repeat(5)}`, { status }));

    expect(readiness(rows).readyIds).toEqual(['FX-44444']);
  });

  it('comes with every listing', async () => {
    await script(sandbox.outside, [{ when: LIST, stdout: { beans: [gql(A, { blockingIds: [B] }), gql(B)] } }]);

    expect(expectValue(await listBeans(ctx))).toMatchObject({ blockedIds: [B], readyIds: [A] });
  });
});

/** The two answers of a successful guarded write: the mutation's own, then the read-back. */
const updated = (field: string, id: string, extra: Record<string, unknown> = {}): Step[] => [
  { when: field, stdout: { [field]: { ...gql(id, extra), body: 'Body' } } },
  reading(id, extra),
];

describe('mutateBean', () => {
  const fields = (extra: Record<string, unknown> = {}): Change => ({ kind: 'fields', title: 'New', ...extra });

  it('sends the hash of the file bytes as ifMatch and returns the bean read back', async () => {
    const { revision } = await seed(A);
    await script(sandbox.outside, updated('updateBean', A, { title: 'New' }));

    const bean = expectValue(await mutateBean(ctx, A, revision, fields({ tags: ['b', 'a'], priority: 'high' })));
    const [call] = await callsOf(sandbox.outside);

    expect(call?.variables).toEqual({ id: A, input: { title: 'New', tags: ['b', 'a'], priority: 'high', ifMatch: revision } });
    expect(bean).toMatchObject({ title: 'New', body: '\nBody', problems: [] });
  });

  it('falls back to the mutation answer when the read-back fails, because the write happened', async () => {
    const { revision } = await seed(A);
    await script(sandbox.outside, [updated('updateBean', A)[0] as Step, { code: 1, stderr: 'Error: graphql: boom\n' }]);

    expect(expectValue(await mutateBean(ctx, A, revision, fields()))).toMatchObject({ id: A, body: 'Body', revision });
  });

  it.each([
    ['status', { kind: 'fields', status: 'draft' }, (ifMatch: string) => ({ id: A, input: { status: 'draft', ifMatch } })],
    ['body', { kind: 'body', body: 'x\ny' }, (ifMatch: string) => ({ id: A, input: { body: 'x\ny', ifMatch } })],
    ['parent set', { kind: 'parent', parentId: B }, (ifMatch: string) => ({ id: A, parent: B, ifMatch })],
    ['parent clear', { kind: 'parent', parentId: null }, (ifMatch: string) => ({ id: A, parent: null, ifMatch })],
  ] as const satisfies readonly (readonly [string, Change, (ifMatch: string) => Record<string, unknown>])[])('applies a %s change as one mutation', async (_name, change, expected) => {
    const { revision } = await seed(A);
    const field = change.kind === 'parent' ? 'setParent' : 'updateBean';
    await script(sandbox.outside, updated(field, A));

    expectValue(await mutateBean(ctx, A, revision, change));
    const [call] = await callsOf(sandbox.outside);

    expect(call?.variables).toEqual(expected(revision));
  });

  it.each([
    ['blocking', 'add', 'addBlocking'],
    ['blocking', 'remove', 'removeBlocking'],
    ['blocked-by', 'add', 'addBlockedBy'],
    ['blocked-by', 'remove', 'removeBlockedBy'],
  ] as const)('edits the %s field with the %s action through %s', async (field, action, mutation) => {
    const { revision } = await seed(A);
    await script(sandbox.outside, updated(mutation, A));

    expectValue(await mutateBean(ctx, A, revision, { kind: 'blocking', field, action, targetId: B }));

    expect((await callsOf(sandbox.outside))[0]?.variables).toEqual({ id: A, target: B, ifMatch: revision });
  });

  describe('checklist', () => {
    const item = (line: number, text: string, checked = true): Change => ({ kind: 'checklist', line, text, checked });

    it('replaces the whole body so a repeated item text cannot be mistaken for another', async () => {
      const { revision } = await seed(A);
      await script(sandbox.outside, [{ when: BODY, stdout: { bean: { body: '\n- [ ] same\n- [ ] same\n  * [X] tab' } } }, ...updated('updateBean', A)]);

      expectValue(await mutateBean(ctx, A, revision, item(2, '- [ ] same')));
      const calls = await callsOf(sandbox.outside);

      expect(calls[1]?.variables).toEqual({
        id: A,
        input: { bodyMod: { replace: [{ old: '\n- [ ] same\n- [ ] same\n  * [X] tab', new: '\n- [ ] same\n- [x] same\n  * [X] tab' }] }, ifMatch: revision },
      });
    });

    it('unchecks, and keeps indentation and markers', async () => {
      const { revision } = await seed(A);
      await script(sandbox.outside, [{ when: BODY, stdout: { bean: { body: '\n  * [X] tab' } } }, ...updated('updateBean', A)]);

      expectValue(await mutateBean(ctx, A, revision, item(1, '  * [X] tab', false)));

      expect((await callsOf(sandbox.outside))[1]?.variables).toMatchObject({ input: { bodyMod: { replace: [{ new: '\n  * [ ] tab' }] } } });
    });

    it('reports a conflict when the line is no longer what the user saw, and an input error when it is no item', async () => {
      const { revision } = await seed(A);
      await script(sandbox.outside, [{ when: BODY, stdout: { bean: { body: '\n- [ ] other' } } }, reading(A)]);
      expect(expectError(await mutateBean(ctx, A, revision, item(1, '- [ ] same')))).toMatchObject({ kind: 'conflict', code: 'body', current: { id: A } });

      await script(sandbox.outside, [{ when: BODY, stdout: { bean: { body: '\nplain' } } }]);
      expect(expectError(await mutateBean(ctx, A, revision, item(1, 'plain')))).toMatchObject({ kind: 'validation', code: 'input' });
    });

    it('reports a vanished bean as a conflict and passes a failed body read on', async () => {
      const { revision } = await seed(A);
      await script(sandbox.outside, [{ when: BODY, stdout: { bean: null } }, { stdout: { bean: null } }]);
      expect(expectError(await mutateBean(ctx, A, revision, item(0, '- [ ] x')))).toMatchObject({ kind: 'conflict', code: 'revision', current: null });

      await script(sandbox.outside, [{ when: BODY, stderr: 'Error: graphql: boom\n', code: 1 }]);
      expect(expectError(await mutateBean(ctx, A, revision, item(0, '- [ ] x')))).toMatchObject({ kind: 'backend', code: 'failed' });
    });
  });

  it('refuses invalid input without running anything', async () => {
    const { revision } = await seed(A);
    const cases: Change[] = [
      { kind: 'fields' },
      { kind: 'fields', title: ' ' },
      { kind: 'fields', title: 'two\nlines' },
      { kind: 'fields', status: 'wip' },
      { kind: 'fields', type: 'story' },
      { kind: 'fields', priority: 'urgent' },
      { kind: 'fields', tags: ['Bad'] },
      { kind: 'fields', tags: ['a', 'a'] },
      { kind: 'checklist', line: -1, text: '- [ ] x', checked: true },
      { kind: 'checklist', line: 1.5, text: '- [ ] x', checked: true },
      { kind: 'parent', parentId: A },
      { kind: 'parent', parentId: 'short' },
      { kind: 'blocking', field: 'blocking', action: 'add', targetId: A },
      { kind: 'blocking', field: 'blocked-by', action: 'add', targetId: 'short' },
      { kind: 'body', body: 'x'.repeat(100_001) },
    ];

    for (const change of cases) expect(expectError(await mutateBean(ctx, A, revision, change)), JSON.stringify(change)).toMatchObject({ kind: 'validation', code: 'input' });
    expect(expectError(await mutateBean(ctx, 'short', revision, { kind: 'body', body: '' }))).toMatchObject({ kind: 'validation', code: 'input' });
    expect(await callsOf(sandbox.outside)).toEqual([]);
  });

  describe('guards', () => {
    it('reports a changed file as a conflict without running the mutation, with the current bean for review', async () => {
      const { file, revision } = await seed(A);
      await writeFile(file, fileText(A, 'Edited elsewhere'));
      await script(sandbox.outside, [reading(A, { title: 'Edited elsewhere' })]);

      const error = expectError(await mutateBean(ctx, A, revision, fields()));
      const calls = await callsOf(sandbox.outside);

      expect(error).toMatchObject({ kind: 'conflict', code: 'revision', current: { title: 'Edited elsewhere' } });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.query).not.toContain('mutation');
    });

    it('reports a missing file as a conflict', async () => {
      await script(sandbox.outside, [{ stdout: { bean: null } }]);

      expect(expectError(await mutateBean(ctx, A, 'f'.repeat(16), fields()))).toMatchObject({ kind: 'conflict', code: 'revision', current: null });
    });

    it('blocks a bean whose ID two files carry, and a bean with frontmatter Beans would damage', async () => {
      const { revision } = await seed(A);
      await mkdir(join(root, 'archive'));
      await writeFile(join(root, 'archive', `${A}--copy.md`), fileText(A));

      expect(expectError(await mutateBean(ctx, A, revision, fields()))).toMatchObject({ kind: 'preservation', code: 'invalid-bean' });

      const other = await seed(B, fileText(B).replace('---\n\n', 'aliases: nick\n---\n\n'));
      expect(expectError(await mutateBean(ctx, B, other.revision, fields()))).toMatchObject({
        kind: 'preservation',
        code: 'unsafe-frontmatter',
        detail: expect.stringContaining('aliases') as string,
      });
      expect(await callsOf(sandbox.outside)).toEqual([]);
    });
  });

  describe('failures', () => {
    it.each([
      ['an ETag mismatch', 'Error: graphql: etag mismatch: provided a, current is b\nUsage:\n', { kind: 'conflict', code: 'etag', current: { id: A } }],
      ['a body mismatch', 'Error: graphql: replacement 0 failed: text not found in body\n', { kind: 'conflict', code: 'body', current: { id: A } }],
      ['a rejected relationship', 'Error: graphql: adding would create cycle\n', { kind: 'validation', code: 'backend' }],
      ['an unloadable project', 'Error: loading beans: loading x.md: bad\n', { kind: 'backend', code: 'invalid-data' }],
    ])('translates %s, re-reads the bean and never retries', async (_name, stderr, expected) => {
      const { revision } = await seed(A);
      await script(sandbox.outside, [{ when: 'updateBean', stderr, code: 1 }, reading(A)]);

      expect(expectError(await mutateBean(ctx, A, revision, fields()))).toMatchObject(expected);
      expect((await callsOf(sandbox.outside)).filter((call) => call.query.includes('mutation'))).toHaveLength(1);
    });

    it('reports a missing executable as unavailable', async () => {
      const { revision } = await seed(A);

      expect(expectError(await mutateBean({ ...ctx, binding: { ...ctx.binding, executable: join(sandbox.outside, 'missing') } }, A, revision, fields()))).toMatchObject({
        kind: 'backend',
        code: 'unavailable',
      });
    });

    it('treats a failed write that changed the file as uncertain and offers the current bean', async () => {
      const { file, revision } = await seed(A);
      await script(sandbox.outside, [
        { when: 'updateBean', stderr: 'Error: graphql: writing file: no space left on device\n', code: 1, writes: [{ file, text: '---\ntitle: trunc' }] },
        { stderr: 'Error: loading beans: loading x\n', code: 1 },
      ]);

      expect(expectError(await mutateBean(ctx, A, revision, fields()))).toEqual({
        kind: 'uncertain',
        message: 'writing file: no space left on device',
        current: null,
        createdIds: [],
      });
    });

    it('treats a timeout after the write landed as uncertain, but one that changed nothing as a plain timeout', async () => {
      const { file, revision } = await seed(A);
      await script(sandbox.outside, [{ when: 'updateBean', sleepMs: 3_000, writes: [{ file, text: fileText(A, 'Landed') }] }]);
      await script(sandbox.outside, [{ when: 'updateBean', sleepMs: 3_000 }]);

      expect(expectError(await mutateBean({ ...ctx, timeoutMs: 300 }, A, revision, fields()))).toMatchObject({ kind: 'backend', code: 'timeout' });

      await script(sandbox.outside, [{ when: 'updateBean', sleepMs: 200, writes: [{ file, text: fileText(A, 'Landed') }], stderr: 'Error: graphql: boom\n', code: 1 }, reading(A, { title: 'Landed' })]);
      expect(expectError(await mutateBean(ctx, A, revision, fields()))).toMatchObject({ kind: 'uncertain', current: { title: 'Landed' } });
    });

    it('can still re-read after a cancellation', async () => {
      const { revision } = await seed(A);
      await script(sandbox.outside, [{ when: 'updateBean', sleepMs: 3_000 }]);
      const controller = new AbortController();
      const pending = mutateBean({ ...ctx, signal: controller.signal }, A, revision, fields());
      setTimeout(() => {
        controller.abort();
      }, 400);

      expect(expectError(await pending)).toMatchObject({ kind: 'backend', code: 'cancelled' });
    });

    it('does not call an unrecognized failure that changed nothing uncertain', async () => {
      const { revision } = await seed(A);
      await script(sandbox.outside, [{ when: 'updateBean', stderr: 'Error: graphql: something odd\n', code: 1 }]);

      expect(expectError(await mutateBean(ctx, A, revision, fields()))).toMatchObject({ kind: 'backend', code: 'failed', message: 'something odd' });
    });

    it('does not trust an answer of the wrong shape: uncertain if the file changed, else a response failure', async () => {
      const { file, revision } = await seed(A);
      await script(sandbox.outside, [{ when: 'updateBean', stdout: { updateBean: { id: 7 } } }]);
      expect(expectError(await mutateBean(ctx, A, revision, fields()))).toMatchObject({ kind: 'backend', code: 'invalid-response' });

      await script(sandbox.outside, [{ when: 'updateBean', stdout: '[]', writes: [{ file, text: fileText(A, 'Landed') }] }, reading(A, { title: 'Landed' })]);
      expect(expectError(await mutateBean(ctx, A, revision, fields()))).toMatchObject({ kind: 'uncertain', current: { title: 'Landed' } });
    });

    it('reports a task root it cannot list', async () => {
      const { revision } = await seed(A);
      const controller = new AbortController();
      controller.abort();

      expect(expectError(await mutateBean({ ...ctx, signal: controller.signal }, A, revision, fields()))).toMatchObject({ kind: 'backend', code: 'cancelled' });
    });
  });
});

describe('createBean', () => {
  const made = (id: string, extra: Record<string, unknown> = {}): Step[] => [
    { when: 'createBean', stdout: { createBean: { ...gql(id, extra), body: 'B' } }, writes: [{ file: join(root, `${id}--t.md`), text: fileText(id) }] },
    reading(id, extra),
  ];

  it('sends explicit status, type and priority, from the project defaults', async () => {
    await script(sandbox.outside, made(A));
    const withDefaults = { ...ctx, binding: { ...ctx.binding, defaults: { status: 'draft', type: 'bug' } } };

    const bean = expectValue(await createBean(withDefaults, { title: 'New' }));

    expect((await callsOf(sandbox.outside))[0]?.variables).toEqual({ input: { title: 'New', status: 'draft', type: 'bug', priority: 'normal' } });
    expect(bean).toMatchObject({ id: A, problems: [], revision: expect.stringMatching(/^[0-9a-f]{16}$/) as string });
  });

  it('passes every optional field and lets the caller override the defaults', async () => {
    await script(sandbox.outside, made(A));

    expectValue(
      await createBean(ctx, { title: 'New', status: 'draft', type: 'epic', priority: 'high', tags: ['x'], body: 'Text', parentId: B, blockingIds: [C], blockedByIds: [B] }),
    );

    expect((await callsOf(sandbox.outside))[0]?.variables).toEqual({
      input: { title: 'New', status: 'draft', type: 'epic', priority: 'high', tags: ['x'], body: 'Text', parent: B, blocking: [C], blockedBy: [B] },
    });
  });

  it('refuses invalid input without running Beans', async () => {
    const cases = [{ title: '' }, { title: 'x', status: 'wip' }, { title: 'x', tags: ['Bad'] }, { title: 'x', parentId: 'nope' }, { title: 'x', blockingIds: ['nope'] }, { title: 'x', blockedByIds: ['nope'] }, { title: 'x', body: 'y'.repeat(100_001) }];

    for (const bean of cases) expect(expectError(await createBean(ctx, bean)), JSON.stringify(bean)).toMatchObject({ kind: 'validation', code: 'input' });
    expect(await callsOf(sandbox.outside)).toEqual([]);
  });

  it('reports a rejection by Beans as validation, with nothing created', async () => {
    await script(sandbox.outside, [{ when: 'createBean', stderr: 'Error: graphql: epic beans can only have milestone as parent, not task\n', code: 1 }]);

    expect(expectError(await createBean(ctx, { title: 'x', parentId: B }))).toMatchObject({ kind: 'validation', code: 'backend' });
  });

  it('reports an unclassified failure that created nothing as a plain failure', async () => {
    await script(sandbox.outside, [{ when: 'createBean', stderr: 'Error: graphql: odd\n', code: 1 }]);

    expect(expectError(await createBean(ctx, { title: 'x' }))).toMatchObject({ kind: 'backend', code: 'failed' });
  });

  it('lists the IDs that appeared after a failed creation, so the caller reconciles instead of retrying', async () => {
    await script(sandbox.outside, [
      { when: 'createBean', stderr: 'Error: graphql: writing file: boom\n', code: 1, writes: [{ file: join(root, `${A}--t.md`), text: fileText(A) }] },
      reading(A),
    ]);

    expect(expectError(await createBean(ctx, { title: 'x' }))).toMatchObject({ kind: 'uncertain', createdIds: [A], current: { id: A } });

    await script(sandbox.outside, [
      {
        when: 'createBean',
        sleepMs: 200,
        stderr: 'Error: graphql: boom\n',
        code: 1,
        writes: [B, C].map((id) => ({ file: join(root, `${id}--t.md`), text: fileText(id) })),
      },
    ]);
    expect(expectError(await createBean(ctx, { title: 'x' }))).toMatchObject({ kind: 'uncertain', createdIds: [B, C], current: null });
  });

  it('cannot list the task root after a failure', async () => {
    const controller = new AbortController();
    const pending = createBean({ ...ctx, signal: controller.signal }, { title: 'x' });
    controller.abort();

    expect(expectError(await pending)).toMatchObject({ kind: 'backend', code: 'cancelled' });
  });
});
