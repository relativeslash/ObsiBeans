import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { changedLines, evaluate, meetsGate, parseDiff, parseLcov, type FileCoverage } from '../../tools/changed-coverage.ts';

const tempRoots: string[] = [];
afterEach(() => {
  tempRoots.splice(0).forEach((root) => {
    rmSync(root, { recursive: true, force: true });
  });
});

function coverage(lines: Record<number, number>, branches: Record<number, boolean[]> = {}): FileCoverage {
  return {
    lines: new Map(Object.entries(lines).map(([line, hits]) => [Number(line), hits])),
    branches: new Map(Object.entries(branches).map(([line, taken]) => [Number(line), taken])),
  };
}

describe('changed-code coverage', () => {
  it('parses added and modified lines from a zero-context diff', () => {
    const diff = [
      'diff --git a/src/views/a.ts b/src/views/a.ts',
      '--- a/src/views/a.ts',
      '+++ b/src/views/a.ts',
      '@@ -3,0 +4,2 @@ context',
      '@@ -10 +12 @@',
      '@@ -20,3 +23,0 @@',
      'diff --git a/src/views/gone.ts b/src/views/gone.ts',
      '--- a/src/views/gone.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
    ].join('\n');

    expect(parseDiff(diff)).toEqual(new Map([['src/views/a.ts', new Set([4, 5, 12])]]));
  });

  it('parses lcov line and branch records with absolute and relative paths', () => {
    const lcov = ['SF:/repo/src/views/a.ts', 'DA:1,3', 'DA:2,0', 'BRDA:2,0,0,1', 'BRDA:2,0,1,-', 'BRDA:2,0,2,0', 'end_of_record', 'SF:src/plugin/b.ts', 'DA:7,1', 'end_of_record'].join('\n');

    expect(parseLcov(lcov, '/repo')).toEqual(new Map([
      ['src/views/a.ts', coverage({ 1: 3, 2: 0 }, { 2: [true, false, false] })],
      ['src/plugin/b.ts', coverage({ 7: 1 })],
    ]));
  });

  it('tallies only changed production lines per layer and reports files without coverage data', () => {
    const report = evaluate(
      new Map<string, Set<number> | 'all'>([
        ['src/views/a.ts', new Set([2, 3])],
        ['src/plugin/b.ts', 'all'],
        ['src/misc.ts', 'all'],
        ['src/views/untested.ts', 'all'],
        ['test/a.test.ts', 'all'],
      ]),
      new Map([
        ['src/views/a.ts', coverage({ 1: 0, 2: 1, 3: 0 }, { 1: [false], 3: [true, false] })],
        ['src/plugin/b.ts', coverage({ 1: 1, 2: 1 })],
        ['src/misc.ts', coverage({ 1: 1 })],
      ]),
    );

    expect(report.results).toEqual([
      { module: '(no layer)', lines: { covered: 1, total: 1 }, branches: { covered: 0, total: 0 } },
      { module: 'plugin', lines: { covered: 2, total: 2 }, branches: { covered: 0, total: 0 } },
      { module: 'views', lines: { covered: 1, total: 2 }, branches: { covered: 1, total: 2 } },
    ]);
    expect(report.gaps).toEqual(['src/views/untested.ts changed but has no coverage data']);
  });

  it('compares unrounded ratios and treats a zero denominator as not applicable', () => {
    expect(meetsGate({ covered: 9, total: 10 }, 0.9)).toBe(true);
    expect(meetsGate({ covered: 8999, total: 10000 }, 0.9)).toBe(false);
    expect(meetsGate({ covered: 0, total: 0 }, 0.9)).toBe(true);
  });

  it('finds committed, uncommitted and untracked changes against a git base', () => {
    const root = mkdtempSync(join(tmpdir(), 'changed-coverage-'));
    tempRoots.push(root);
    const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    git('init', '--quiet');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    mkdirSync(join(root, 'src/views'), { recursive: true });
    writeFileSync(join(root, 'src/views/a.ts'), 'one\ntwo\nthree\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'base');
    const base = git('rev-parse', 'HEAD').trim();
    writeFileSync(join(root, 'src/views/a.ts'), 'one\nTWO\nthree\nfour\n');
    writeFileSync(join(root, 'src/views/new.ts'), 'fresh\n');
    writeFileSync(join(root, 'notes.md'), 'outside src\n');

    expect(changedLines(root, base, [])).toEqual(new Map<string, Set<number> | 'all'>([
      ['src/views/a.ts', new Set([2, 4])],
      ['src/views/new.ts', 'all'],
    ]));
    expect(changedLines(root, undefined, ['src/views/a.ts'])).toEqual(new Map([['src/views/a.ts', 'all']]));
  });
});
