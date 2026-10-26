import { chmod, mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanTaskRoot } from '../../src/adapter/task-root.ts';
import { makeSandbox, type Sandbox } from '../support/project.ts';

let sandbox: Sandbox;
let root: string;
beforeEach(async () => {
  sandbox = await makeSandbox();
  root = join(sandbox.vault, 'Task root');
  await mkdir(root);
});
afterEach(() => sandbox.dispose());

const touch = (...path: string[]): Promise<void> => writeFile(join(root, ...path), '---\n---\n');
const options = { prefix: 'FX-', idLength: 5 };

describe('scanTaskRoot', () => {
  it('lists beans in any subfolder, with and without a slug, in a stable order', async () => {
    await mkdir(join(root, 'archive', 'deep'), { recursive: true });
    await touch('FX-zz999--second.md');
    await touch('FX-aa111.md');
    await touch('archive', 'FX-bb222--archived.md');
    await touch('archive', 'deep', 'FX-cc333--with--double-dash.md');

    const result = await scanTaskRoot(root, options);

    expect(result).toEqual({
      ok: true,
      scan: {
        invalid: [],
        files: [
          { path: 'FX-aa111.md', id: 'FX-aa111' },
          { path: 'FX-zz999--second.md', id: 'FX-zz999' },
          { path: 'archive/FX-bb222--archived.md', id: 'FX-bb222' },
          { path: 'archive/deep/FX-cc333--with--double-dash.md', id: 'FX-cc333' },
        ],
      },
    });
  });

  it('reports ordinary notes and badly named files as invalid data, and ignores other file types', async () => {
    await mkdir(join(root, 'notes'));
    await touch('README.md');
    await touch('FX-abc.md');
    await touch('FX-abcdef--too-long.md');
    await touch('FX-ABC12--upper.md');
    await touch('OTHER-abc12--prefix.md');
    await touch('FX-abc12-slug.md');
    await touch('notes', 'Meeting.md');
    await touch('FX-abc12--ok.md');
    await touch('image.png');
    await touch('FX-abc12--ok.md.bak');

    const result = await scanTaskRoot(root, options);

    expect(result.ok && result.scan.files.map((file) => file.id)).toEqual(['FX-abc12']);
    expect(result.ok && result.scan.invalid).toEqual([
      { path: 'FX-ABC12--upper.md', reason: 'name' },
      { path: 'FX-abc.md', reason: 'name' },
      { path: 'FX-abc12-slug.md', reason: 'name' },
      { path: 'FX-abcdef--too-long.md', reason: 'name' },
      { path: 'OTHER-abc12--prefix.md', reason: 'name' },
      { path: 'README.md', reason: 'name' },
      { path: 'notes/Meeting.md', reason: 'name' },
    ]);
  });

  it('treats prefix characters literally', async () => {
    await touch('a.b+-xy12--note.md');
    await touch('aXb+-xy12--note.md');

    const result = await scanTaskRoot(root, { prefix: 'a.b+-', idLength: 4 });

    expect(result.ok && result.scan.files.map((file) => file.id)).toEqual(['a.b+-xy12']);
    expect(result.ok && result.scan.invalid).toEqual([{ path: 'aXb+-xy12--note.md', reason: 'name' }]);
  });

  it('accepts an empty prefix', async () => {
    await touch('abcd--x.md');

    expect(await scanTaskRoot(root, { prefix: '', idLength: 4 })).toMatchObject({ ok: true, scan: { files: [{ id: 'abcd' }] } });
  });

  it('never follows symbolic links out of the task root', async () => {
    await writeFile(join(sandbox.outside, 'FX-out11--leak.md'), 'secret');
    await symlink(sandbox.outside, join(root, 'linked-folder'));
    await symlink(join(sandbox.outside, 'FX-out11--leak.md'), join(root, 'FX-lnk11--link.md'));

    const result = await scanTaskRoot(root, options);

    expect(result).toEqual({
      ok: true,
      scan: {
        files: [],
        invalid: [{ path: 'FX-lnk11--link.md', reason: 'symlink' }, { path: 'linked-folder', reason: 'symlink' }],
      },
    });
  });

  it.skipIf(process.getuid?.() === 0)('reports an unreadable folder instead of failing the scan', async () => {
    await mkdir(join(root, 'locked'));
    await touch('locked', 'FX-hid11--hidden.md');
    await touch('FX-abc12--ok.md');
    await chmod(join(root, 'locked'), 0o000);

    try {
      const result = await scanTaskRoot(root, options);

      expect(result.ok && result.scan.files.map((file) => file.id)).toEqual(['FX-abc12']);
      expect(result.ok && result.scan.invalid).toEqual([{ path: 'locked', reason: 'unreadable' }]);
    } finally {
      await chmod(join(root, 'locked'), 0o755);
    }
  });

  it('gives up on a task root larger than the limit', async () => {
    for (const name of ['a', 'b', 'c']) await touch(`FX-${name.repeat(5)}.md`);

    expect(await scanTaskRoot(root, { ...options, limit: 2 })).toEqual({ ok: false, code: 'task-root-too-large', limit: 2 });
    expect(await scanTaskRoot(root, { ...options, limit: 3 })).toMatchObject({ ok: true });
  });

  it('stops when cancelled', async () => {
    expect(await scanTaskRoot(root, { ...options, signal: AbortSignal.abort() })).toEqual({ ok: false, code: 'cancelled' });
  });
});
