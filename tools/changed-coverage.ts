import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { LAYERS, PRODUCTION_ROOT, type Layer } from './architecture.ts';

export const MIN_LINE_RATIO = 0.9;
export const MIN_BRANCH_RATIO = 0.8;

/** Per file: executable line -> hit count, and branch line -> taken flags. */
export interface FileCoverage {
  readonly lines: Map<number, number>;
  readonly branches: Map<number, boolean[]>;
}

/** Changed lines per repository-relative file, or `all` when there is no comparison base. */
export type ChangedLines = Map<string, Set<number> | 'all'>;

export interface Tally {
  covered: number;
  total: number;
}

export interface ModuleResult {
  readonly module: string;
  readonly lines: Tally;
  readonly branches: Tally;
}

export function parseLcov(text: string, root: string): Map<string, FileCoverage> {
  const files = new Map<string, FileCoverage>();
  let current: FileCoverage | undefined;
  for (const line of text.split('\n')) {
    const [tag, value = ''] = line.split(/:(.*)/s);
    if (tag === 'SF') {
      const path = isAbsolute(value) ? relative(root, value) : value;
      current = { lines: new Map(), branches: new Map() };
      files.set(path.split(sep).join('/'), current);
    } else if (tag === 'DA' && current) {
      const [lineNumber, hits] = value.split(',').map(Number);
      if (lineNumber !== undefined && hits !== undefined) current.lines.set(lineNumber, hits);
    } else if (tag === 'BRDA' && current) {
      const [lineNumber, , , taken] = value.split(',');
      const branches = current.branches.get(Number(lineNumber)) ?? [];
      branches.push(taken !== '-' && Number(taken) > 0);
      current.branches.set(Number(lineNumber), branches);
    }
  }
  return files;
}

/** Parses `git diff --unified=0` output into added or modified line numbers of the new version. */
export function parseDiff(text: string): ChangedLines {
  const changed: ChangedLines = new Map();
  let file: Set<number> | undefined;
  for (const line of text.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line === '+++ /dev/null' ? undefined : new Set();
      if (file) changed.set(line.slice('+++ b/'.length), file);
    } else if (file && line.startsWith('@@')) {
      const match = /\+(\d+)(?:,(\d+))? @@/.exec(line);
      const start = Number(match?.[1]);
      const count = Number(match?.[2] ?? 1);
      for (let lineNumber = start; lineNumber < start + count; lineNumber++) file.add(lineNumber);
    }
  }
  return changed;
}

export function evaluate(changed: ChangedLines, coverage: ReadonlyMap<string, FileCoverage>, layers: readonly Layer[] = LAYERS): { results: ModuleResult[]; gaps: string[] } {
  const results = new Map<string, ModuleResult>();
  const gaps: string[] = [];
  for (const [path, lines] of changed) {
    if (!path.startsWith(PRODUCTION_ROOT)) continue;
    const file = coverage.get(path);
    if (!file) {
      gaps.push(`${path} changed but has no coverage data`);
      continue;
    }
    const module = layers.find((layer) => path.startsWith(layer.root))?.name ?? '(no layer)';
    const result = results.get(module) ?? { module, lines: { covered: 0, total: 0 }, branches: { covered: 0, total: 0 } };
    const isChanged = (lineNumber: number): boolean => lines === 'all' || lines.has(lineNumber);
    for (const [lineNumber, hits] of file.lines) {
      if (!isChanged(lineNumber)) continue;
      result.lines.total++;
      if (hits > 0) result.lines.covered++;
    }
    for (const [lineNumber, taken] of file.branches) {
      if (!isChanged(lineNumber)) continue;
      result.branches.total += taken.length;
      result.branches.covered += taken.filter(Boolean).length;
    }
    results.set(module, result);
  }
  return { results: [...results.values()].sort((a, b) => a.module.localeCompare(b.module)), gaps };
}

export function meetsGate(tally: Tally, minimum: number): boolean {
  return tally.total === 0 || tally.covered / tally.total >= minimum;
}

export function changedLines(root: string, base: string | undefined, productionFiles: readonly string[]): ChangedLines {
  if (base === undefined) return new Map(productionFiles.map((file) => [file, 'all']));
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const changed = parseDiff(git('diff', '--unified=0', '--no-color', '--no-ext-diff', base, '--', PRODUCTION_ROOT));
  for (const file of git('ls-files', '--others', '--exclude-standard', '--', PRODUCTION_ROOT).split('\n').filter(Boolean)) {
    changed.set(file, 'all');
  }
  return changed;
}

/**
 * Comparison base: explicit argument, COVERAGE_BASE, then the merge base with the upstream branch.
 * `none` or an all-zero commit (a new branch's push event) means there is no base.
 */
function resolveBase(root: string, argument: string | undefined): string | undefined {
  const requested = argument || process.env.COVERAGE_BASE || undefined;
  if (requested === 'none' || /^0+$/.test(requested ?? '')) return undefined;
  try {
    return execFileSync('git', ['merge-base', 'HEAD', requested ?? '@{upstream}'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (error) {
    if (requested !== undefined) throw new Error(`Cannot find a merge base with ${requested}`, { cause: error });
    return undefined;
  }
}

function percent(tally: Tally): string {
  return tally.total === 0 ? 'not applicable (0 changed)' : `${String(tally.covered)}/${String(tally.total)} (${(100 * tally.covered / tally.total).toFixed(2)}%)`;
}

if (import.meta.main) {
  const root = process.cwd();
  const lcovPath = join(root, 'coverage', 'lcov.info');
  if (!existsSync(lcovPath)) {
    console.error('FAIL coverage/lcov.info is missing; run the coverage suite first');
    process.exit(1);
  }
  const coverage = parseLcov(readFileSync(lcovPath, 'utf8'), root);
  const base = resolveBase(root, process.argv[2]);
  const { results, gaps } = evaluate(changedLines(root, base, [...coverage.keys()]), coverage);
  console.log(`Changed-code coverage against ${base ?? 'no base (all production code is new)'}; scope ${PRODUCTION_ROOT}, tests and tools excluded`);
  let failed = gaps.length > 0;
  gaps.forEach((gap) => {
    console.error(`FAIL ${gap}`);
  });
  for (const { module, lines, branches } of results) {
    const ok = meetsGate(lines, MIN_LINE_RATIO) && meetsGate(branches, MIN_BRANCH_RATIO);
    failed ||= !ok;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${module}: lines ${percent(lines)} min 90%, branches ${percent(branches)} min 80%`);
  }
  process.exitCode = failed ? 1 : 0;
}
