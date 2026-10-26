import { existsSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, normalize } from 'node:path';
import ts from 'typescript';
import { loadSources, type SourceFile } from './source-files.ts';

/** Production layers from the v1 design's module boundaries. Same-layer imports are always allowed. */
export interface Layer {
  readonly name: string;
  /** Repository-relative directory ending in `/`. */
  readonly root: string;
  readonly layers: readonly string[];
  /** Layers that may only be imported with `import type` or `export type`. */
  readonly typeOnlyLayers: readonly string[];
  readonly packages: readonly string[];
  readonly nodeBuiltins: boolean;
}

export const PRODUCTION_ROOT = 'src/';

export const LAYERS: readonly Layer[] = [
  { name: 'adapter', root: 'src/adapter/', layers: [], typeOnlyLayers: [], packages: [], nodeBuiltins: true },
  { name: 'state', root: 'src/state/', layers: [], typeOnlyLayers: ['adapter'], packages: [], nodeBuiltins: false },
  { name: 'views', root: 'src/views/', layers: ['state'], typeOnlyLayers: [], packages: ['intl-messageformat', 'obsidian', 'svelte'], nodeBuiltins: false },
  { name: 'plugin', root: 'src/plugin/', layers: ['adapter', 'state', 'views'], typeOnlyLayers: [], packages: ['obsidian'], nodeBuiltins: false },
];

/** An individually approved existing violation, identified by its exact `from -> to` edge (ENG-DEBT-001). */
export interface ArchitectureException {
  readonly from: string;
  readonly to: string;
  readonly justification: string;
  readonly approval: string;
  readonly reviewTrigger: string;
}

export const ARCHITECTURE_EXCEPTIONS: readonly ArchitectureException[] = [];

interface ImportEdge {
  readonly from: string;
  readonly specifier: string;
  readonly typeOnly: boolean;
}

export function checkArchitecture(
  root: string,
  layers: readonly Layer[] = LAYERS,
  exceptions: readonly ArchitectureException[] = ARCHITECTURE_EXCEPTIONS,
): string[] {
  const sources = loadSources(root).filter((file) => file.path.startsWith(PRODUCTION_ROOT));
  if (sources.length === 0) return [`No production sources under ${PRODUCTION_ROOT}`];

  const violations = new Map<string, string>();
  const graph = new Map<string, string[]>();
  for (const file of sources) {
    const layer = layerOf(file.path, layers);
    if (!layer) violations.set(`${file.path} -> (no layer)`, `${file.path} is outside every declared layer`);
    const targets: string[] = [];
    for (const edge of importsOf(file)) {
      if (edge.specifier.startsWith('<')) {
        violations.set(`${edge.from} -> ${edge.specifier}`, `${edge.from} has an unanalyzable ${edge.specifier}`);
        continue;
      }
      const target = edge.specifier.startsWith('.') ? resolveRelative(root, edge) : edge.specifier;
      if (target === undefined) {
        violations.set(`${edge.from} -> ${edge.specifier}`, `${edge.from} imports unresolved module ${edge.specifier}`);
        continue;
      }
      if (edge.specifier.startsWith('.')) targets.push(target);
      const problem = layer && ruleViolation(layer, target, edge, layers);
      if (problem) violations.set(`${edge.from} -> ${target}`, `${edge.from} imports ${target}: ${problem}`);
    }
    graph.set(file.path, targets);
  }

  const failures: string[] = [];
  for (const exception of exceptions) {
    const key = `${exception.from} -> ${exception.to}`;
    if ([exception.justification, exception.approval, exception.reviewTrigger].some((value) => value.trim() === '')) {
      failures.push(`Invalid architecture exception ${key}: every field must be non-empty`);
    } else if (!violations.delete(key)) {
      failures.push(`Stale architecture exception ${key}: the violation no longer exists`);
    }
  }
  return [...failures, ...violations.values(), ...findCycles(graph).map((cycle) => `Import cycle: ${cycle.join(' -> ')}`)];
}

function layerOf(path: string, layers: readonly Layer[]): Layer | undefined {
  return layers.find((layer) => path.startsWith(layer.root));
}

function ruleViolation(layer: Layer, target: string, edge: ImportEdge, layers: readonly Layer[]): string | undefined {
  if (!edge.specifier.startsWith('.')) {
    const bare = target.replace(/^node:/, '');
    if (target.startsWith('node:') || builtinModules.includes(bare)) {
      return layer.nodeBuiltins ? undefined : `the ${layer.name} layer may not use Node built-ins`;
    }
    const name = target.startsWith('@') ? target.split('/').slice(0, 2).join('/') : (target.split('/')[0] ?? target);
    return layer.packages.includes(name) ? undefined : `the ${layer.name} layer may not use package ${name}`;
  }
  if (!target.startsWith(PRODUCTION_ROOT)) return `production code may not import outside ${PRODUCTION_ROOT}`;
  const targetLayer = layerOf(target, layers);
  if (!targetLayer) return 'the target is outside every declared layer';
  if (targetLayer === layer || layer.layers.includes(targetLayer.name)) return undefined;
  if (layer.typeOnlyLayers.includes(targetLayer.name)) {
    return edge.typeOnly ? undefined : `the ${layer.name} layer may only use type imports from ${targetLayer.name}`;
  }
  return `the ${layer.name} layer may not depend on ${targetLayer.name}`;
}

function importsOf(file: SourceFile): ImportEdge[] {
  const edges: ImportEdge[] = [];
  const add = (specifier: ts.Node | undefined, typeOnly: boolean, node: ts.Node): void => {
    if (specifier && ts.isStringLiteralLike(specifier)) edges.push({ from: file.path, specifier: specifier.text, typeOnly });
    else edges.push({ from: file.path, specifier: `<non-literal import at ${String(file.ast.getLineAndCharacterOfPosition(node.getStart(file.ast)).line + 1)}>`, typeOnly });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) add(node.moduleSpecifier, node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword, node);
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier) add(node.moduleSpecifier, node.isTypeOnly, node);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression, node.isTypeOnly, node);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal, true, node);
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
             (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) add(node.arguments[0], false, node);
    ts.forEachChild(node, visit);
  };
  visit(file.ast);
  return edges;
}

function resolveRelative(root: string, edge: ImportEdge): string | undefined {
  const base = normalize(join(dirname(edge.from), edge.specifier)).split('\\').join('/');
  return [base, `${base}.ts`, `${base}/index.ts`].find((candidate) => {
    const path = join(root, candidate);
    return existsSync(path) && statSync(path).isFile();
  });
}

/** Cycles found by one depth-first search: at least one per cyclic group, each rotated to start at its smallest member. */
function findCycles(graph: ReadonlyMap<string, readonly string[]>): string[][] {
  const cycles = new Map<string, string[]>();
  const done = new Set<string>();
  const stack: string[] = [];
  const visit = (node: string): void => {
    const index = stack.indexOf(node);
    if (index >= 0) {
      const cycle = stack.slice(index);
      const start = cycle.indexOf([...cycle].sort()[0] ?? node);
      const rotated = [...cycle.slice(start), ...cycle.slice(0, start)];
      cycles.set(rotated.join(' '), [...rotated, rotated[0] ?? node]);
      return;
    }
    if (done.has(node)) return;
    stack.push(node);
    (graph.get(node) ?? []).forEach(visit);
    stack.pop();
    done.add(node);
  };
  [...graph.keys()].sort().forEach(visit);
  return [...cycles.values()];
}

if (import.meta.main) {
  const violations = checkArchitecture(process.cwd());
  violations.forEach((violation) => {
    console.error(`FAIL ${violation}`);
  });
  console.log(`Architecture: ${String(violations.length)} violations`);
  process.exitCode = violations.length > 0 ? 1 : 0;
}
