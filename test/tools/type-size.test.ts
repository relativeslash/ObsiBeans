import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseSource } from '../../tools/source-files.ts';
import { checkTypeSizes, evaluateSizes, measureTypes, type SizeException, type TypeMeasure } from '../../tools/type-size.ts';

/** A class whose declaration spans exactly `codeLines` code lines. */
function classWith(name: string, codeLines: number): string {
  return [`export class ${name} {`, ...Array.from({ length: codeLines - 2 }, (_, i) => `  field${String(i)} = ${String(i)};`), '}'].join('\n');
}

function measure(text: string, path = 'src/sample.ts'): Map<string, number> {
  return new Map(measureTypes(parseSource(path, text)).map((type) => [type.id.slice(path.length + 1), type.codeLines]));
}

function sized(id: string, codeLines: number): TypeMeasure {
  return { id, location: `${id}:1`, codeLines };
}

const approved: Omit<SizeException, 'type' | 'maxCodeLines'> = {
  justification: 'Generated parser table',
  approval: 'Maintainer review in a test fixture',
  mitigation: 'Split when the grammar changes',
  reviewTrigger: 'Next grammar change',
};

const tempRoots: string[] = [];
afterEach(() => {
  tempRoots.splice(0).forEach((root) => {
    rmSync(root, { recursive: true, force: true });
  });
});

function project(files: Record<string, string>, roots = ['src', 'test', 'tools']): string {
  const root = mkdtempSync(join(tmpdir(), 'type-size-'));
  tempRoots.push(root);
  roots.forEach((dir) => mkdirSync(join(root, dir), { recursive: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe('type-size counting', () => {
  it('ignores documentation, comment-only and blank lines, counting a code line with a comment once', () => {
    const plain = 'export interface Shape {\n  width: number;\n  height: number;\n}';
    const commented = [
      '/**',
      ' * Long documentation that must not consume the budget.',
      ' */',
      'export interface Shape {',
      '  // a line comment',
      '',
      '  /* a block',
      '     comment */',
      '  width: number; // trailing comment',
      '  height: number; /* trailing block */',
      '}',
    ].join('\n');

    expect(measure(plain).get('Shape')).toBe(4);
    expect(measure(commented).get('Shape')).toBe(4);
  });

  it('treats comment markers inside strings, templates and regular expressions as code', () => {
    const text = [
      'export class Literals {',
      "  url = 'https://example.com // not a comment';",
      '  pattern = /\\/\\*.*\\*\\//;',
      '  template = `',
      '    /* still template text */',
      '',
      '    // also template text',
      '  `;',
      '}',
    ].join('\n');

    expect(measure(text).get('Literals')).toBe(8);
  });

  it('counts nested types inside the outer extent and on their own, and combines merged declarations', () => {
    const text = [
      'export class Outer {',
      '  method() {',
      '    class Inner {',
      '      value = 1;',
      '    }',
      '    return new Inner();',
      '  }',
      '}',
      'interface Merged { a: string }',
      'interface Merged { b: string }',
      'export default class {}',
      'export const Assigned = class {};',
      'register(class {});',
      'type Alias = { x: number };',
      'enum Mode { On, Off }',
    ].join('\n');

    expect(Object.fromEntries(measure(text))).toEqual({
      Outer: 8,
      'Outer.method.Inner': 3,
      Merged: 2,
      default: 1,
      Assigned: 1,
      '<anonymous@13:10>': 1,
      Alias: 1,
      Mode: 1,
    });
  });

  it('measures types inside Svelte scripts at their original lines', () => {
    const text = '<script lang="ts">\n  interface Props {\n    title: string;\n  }\n</script>\n\n<p>Plain markup</p>\n';
    const [type] = measureTypes(parseSource('src/Card.svelte', text));

    expect(type).toEqual({ id: 'src/Card.svelte#Props', location: 'src/Card.svelte:2', codeLines: 3 });
  });

  it('fails on unparseable sources and missing roots instead of skipping them', () => {
    expect(() => parseSource('src/broken.ts', 'export class {')).toThrow(/Cannot parse src\/broken\.ts/);
    expect(() => parseSource('src/Broken.svelte', '<script>let a = </script>')).toThrow(/Cannot parse/);
    expect(() => checkTypeSizes(project({}, ['src', 'test']))).toThrow('Required source root is missing: tools');
  });
});

describe('type-size gate', () => {
  it('warns above 300 and fails at 500 code lines', () => {
    const sizes = [300, 301, 499, 500].map((lines) => measure(classWith('Sized', lines)).get('Sized'));
    expect(sizes).toEqual([300, 301, 499, 500]);

    const report = evaluateSizes([sized('a#At300', 300), sized('a#At301', 301), sized('a#At499', 499), sized('a#At500', 500)], []);

    expect(report.warnings.map((warning) => warning.split(' ')[0])).toEqual(['a#At301', 'a#At499', 'a#At500']);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatch(/^a#At500 .* must stay below 500/);
  });

  it('accepts an approved exception within its ceiling and rejects over-ceiling, unneeded, stale, duplicate and invalid ones', () => {
    const measures = [sized('a#Big', 520), sized('a#Bigger', 600), sized('a#Shrunk', 450)];
    const exceptions: SizeException[] = [
      { ...approved, type: 'a#Big', maxCodeLines: 520 },
      { ...approved, type: 'a#Bigger', maxCodeLines: 550 },
      { ...approved, type: 'a#Shrunk', maxCodeLines: 520 },
      { ...approved, type: 'a#Gone', maxCodeLines: 520 },
      { ...approved, type: 'a#Big', maxCodeLines: 520 },
      { ...approved, type: 'a#Unapproved', maxCodeLines: 520, approval: ' ' },
      { ...approved, type: 'a#Low', maxCodeLines: 499 },
    ];

    const { failures } = evaluateSizes(measures, exceptions);

    expect(failures).toEqual([
      'Stale size exception: no type a#Gone',
      'Duplicate size exception for a#Big',
      'Invalid size exception for a#Unapproved: every field must be non-empty',
      'Invalid size exception for a#Low: maxCodeLines must be an integer of at least 500',
      'a#Bigger (a#Bigger:1) has 600 code lines; exceeds its approved ceiling of 550',
      'a#Shrunk (a#Shrunk:1) has 450 code lines; its size exception is no longer needed and must be removed',
    ]);
  });

  it('discovers every owned root, nested generated sources and root build configuration', () => {
    const root = project({
      'src/generated/schema.ts': classWith('Generated', 500),
      'test/helper.ts': 'export type Helper = string;',
      'tools/tool.cjs': 'module.exports = class Tool {};',
      'build.config.ts': 'export interface BuildConfig { out: string }',
      '.pnp.cjs': 'module.exports = class PackageManagerRuntime {};',
    });

    const report = checkTypeSizes(root, []);

    expect(report.measures.map((type) => type.id).sort()).toEqual([
      'build.config.ts#BuildConfig',
      'src/generated/schema.ts#Generated',
      'test/helper.ts#Helper',
      'tools/tool.cjs#Tool',
    ]);
    expect(report.failures).toHaveLength(1);
  });

  // Parses every source file with the TypeScript compiler; under parallel coverage runs that exceeds the 5 s default.
  it('passes the real repository', () => {
    expect(checkTypeSizes(process.cwd()).failures).toEqual([]);
  }, 30_000);
});
