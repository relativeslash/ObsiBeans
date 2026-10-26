import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkArchitecture, LAYERS, type ArchitectureException } from '../../tools/architecture.ts';

const tempRoots: string[] = [];
afterEach(() => {
  tempRoots.splice(0).forEach((root) => {
    rmSync(root, { recursive: true, force: true });
  });
});

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'architecture-'));
  tempRoots.push(root);
  ['src', 'test', 'tools'].forEach((dir) => {
    mkdirSync(join(root, dir));
  });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const valid = {
  'src/adapter/process.ts': "import { spawn } from 'node:child_process';\nexport type Result = string;\nexport const run = spawn;",
  'src/state/store.ts': "import type { Result } from '../adapter/process.ts';\nexport type { Result } from '../adapter/process.ts';\nexport const empty: Result[] = [];",
  'src/views/List.svelte': "<script lang=\"ts\">\n  import { empty } from '../state/store.ts';\n  import { mount } from 'svelte';\n</script>",
  'src/views/host.ts': "import { ItemView } from 'obsidian';\nimport List from './List.svelte';\nexport { ItemView, List };",
  'src/plugin/main.ts': "import { run } from '../adapter/process.ts';\nimport { empty } from '../state/store';\nimport { List } from '../views/host.ts';\nimport { Plugin } from 'obsidian';",
  'test/outside.ts': "import { readFileSync } from 'node:fs';",
};

describe('architecture gate', () => {
  it('accepts the declared layer dependencies', () => {
    expect(checkArchitecture(project(valid))).toEqual([]);
  });

  it('rejects layer, package, built-in, type-only, scope and resolution violations', () => {
    const root = project({
      ...valid,
      'src/adapter/ui.ts': "import { Notice } from 'obsidian';",
      'src/state/runtime.ts': "import { run } from '../adapter/process.ts';\nimport { readFile } from 'fs';",
      'src/views/direct.ts': "export { run } from '../adapter/process.ts';\nconst lazy = import('@scope/pkg/sub');",
      'src/views/List.svelte': "<script lang=\"ts\">\n  import { spawn } from 'node:child_process';\n</script>",
      'src/plugin/escape.ts': "import '../../test/outside.ts';\nimport './missing.ts';\nconst name = 'x';\nrequire(name);",
      'src/misc.ts': 'export const loose = 1;',
    });

    expect(checkArchitecture(root).sort()).toEqual([
      'src/adapter/ui.ts imports obsidian: the adapter layer may not use package obsidian',
      'src/misc.ts is outside every declared layer',
      'src/plugin/escape.ts has an unanalyzable <non-literal import at 4>',
      'src/plugin/escape.ts imports test/outside.ts: production code may not import outside src/',
      'src/plugin/escape.ts imports unresolved module ./missing.ts',
      'src/state/runtime.ts imports fs: the state layer may not use Node built-ins',
      'src/state/runtime.ts imports src/adapter/process.ts: the state layer may only use type imports from adapter',
      'src/views/List.svelte imports node:child_process: the views layer may not use Node built-ins',
      'src/views/direct.ts imports @scope/pkg/sub: the views layer may not use package @scope/pkg',
      'src/views/direct.ts imports src/adapter/process.ts: the views layer may not depend on adapter',
    ]);
  });

  it('reports import cycles once', () => {
    const root = project({
      'src/state/a.ts': "import { b } from './b.ts';\nexport const a = b;",
      'src/state/b.ts': "import { c } from './c.ts';\nexport const b = c;",
      'src/state/c.ts': "import { a } from './a.ts';\nexport const c = a;",
    });

    expect(checkArchitecture(root)).toEqual(['Import cycle: src/state/a.ts -> src/state/b.ts -> src/state/c.ts -> src/state/a.ts']);
  });

  it('suppresses only exact approved edges and rejects stale or incomplete exceptions', () => {
    const root = project({ ...valid, 'src/adapter/ui.ts': "import { Notice } from 'obsidian';" });
    const exception: ArchitectureException = {
      from: 'src/adapter/ui.ts',
      to: 'obsidian',
      justification: 'Legacy notice helper',
      approval: 'Maintainer review in a test fixture',
      reviewTrigger: 'Next adapter change',
    };

    expect(checkArchitecture(root, LAYERS, [exception])).toEqual([]);
    expect(checkArchitecture(root, LAYERS, [exception, { ...exception, from: 'src/adapter/gone.ts' }])).toEqual([
      'Stale architecture exception src/adapter/gone.ts -> obsidian: the violation no longer exists',
    ]);
    expect(checkArchitecture(root, LAYERS, [{ ...exception, approval: '' }])).toEqual([
      'Invalid architecture exception src/adapter/ui.ts -> obsidian: every field must be non-empty',
      'src/adapter/ui.ts imports obsidian: the adapter layer may not use package obsidian',
    ]);
  });

  it('fails when production sources are missing', () => {
    expect(checkArchitecture(project({}))).toEqual(['No production sources under src/']);
  });

  it('passes the real repository', () => {
    expect(checkArchitecture(process.cwd())).toEqual([]);
  });
});
