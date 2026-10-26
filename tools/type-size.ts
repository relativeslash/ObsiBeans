import ts from 'typescript';
import { loadSources, type SourceFile } from './source-files.ts';

export const REVIEW_THRESHOLD = 300;
export const HARD_LIMIT = 500;

/** An individually approved oversized type (ENG-SIZE-005). Every field is required. */
export interface SizeException {
  readonly type: string;
  readonly maxCodeLines: number;
  readonly justification: string;
  readonly approval: string;
  readonly mitigation: string;
  readonly reviewTrigger: string;
}

/** Checked-in exception list. Changes need maintainer review in the same change as the type. */
export const SIZE_EXCEPTIONS: readonly SizeException[] = [];

export interface TypeMeasure {
  /** `<path>#<qualified name>`; anonymous types use `<anonymous@line:column>`. */
  readonly id: string;
  readonly location: string;
  readonly codeLines: number;
}

export interface SizeReport {
  readonly measures: readonly TypeMeasure[];
  readonly warnings: readonly string[];
  readonly failures: readonly string[];
}

export function checkTypeSizes(root: string, exceptions: readonly SizeException[] = SIZE_EXCEPTIONS): SizeReport {
  return evaluateSizes(loadSources(root).flatMap(measureTypes), exceptions);
}

export function measureTypes(file: SourceFile): TypeMeasure[] {
  const { ast, path } = file;
  const codeLines = tokenLines(ast);
  const types = new Map<string, { location: string; lines: Set<number> }>();

  const visit = (node: ts.Node, scope: readonly string[]): void => {
    const name = scopeName(node, ast);
    const childScope = name === undefined ? scope : [...scope, name];
    if (isMeasuredType(node)) {
      const id = `${path}#${childScope.join('.')}`;
      const start = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line;
      const end = ast.getLineAndCharacterOfPosition(node.getEnd()).line;
      const entry = types.get(id) ?? { location: `${path}:${String(start + 1)}`, lines: new Set<number>() };
      for (let line = start; line <= end; line++) if (codeLines.has(line)) entry.lines.add(line);
      types.set(id, entry);
    }
    ts.forEachChild(node, (child) => {
      visit(child, childScope);
    });
  };
  visit(ast, []);
  return [...types].map(([id, { location, lines }]) => ({ id, location, codeLines: lines.size }));
}

export function evaluateSizes(measures: readonly TypeMeasure[], exceptions: readonly SizeException[]): SizeReport {
  const warnings: string[] = [];
  const failures: string[] = [];
  const byId = new Map(measures.map((measure) => [measure.id, measure]));
  const exceptionById = new Map<string, SizeException>();

  for (const exception of exceptions) {
    const problem = invalidException(exception);
    if (problem) failures.push(`Invalid size exception for ${exception.type || '<empty>'}: ${problem}`);
    else if (exceptionById.has(exception.type)) failures.push(`Duplicate size exception for ${exception.type}`);
    else if (!byId.has(exception.type)) failures.push(`Stale size exception: no type ${exception.type}`);
    exceptionById.set(exception.type, exception);
  }

  for (const measure of measures) {
    const label = `${measure.id} (${measure.location}) has ${String(measure.codeLines)} code lines`;
    const exception = exceptionById.get(measure.id);
    if (measure.codeLines > REVIEW_THRESHOLD) warnings.push(`${label}; above the ${String(REVIEW_THRESHOLD)}-line review threshold`);
    if (exception) {
      if (measure.codeLines < HARD_LIMIT) failures.push(`${label}; its size exception is no longer needed and must be removed`);
      else if (measure.codeLines > exception.maxCodeLines) failures.push(`${label}; exceeds its approved ceiling of ${String(exception.maxCodeLines)}`);
    } else if (measure.codeLines >= HARD_LIMIT) {
      failures.push(`${label}; must stay below ${String(HARD_LIMIT)} without an approved exception`);
    }
  }
  return { measures, warnings, failures };
}

function invalidException(exception: SizeException): string | undefined {
  const text = [exception.type, exception.justification, exception.approval, exception.mitigation, exception.reviewTrigger];
  if (text.some((value) => value.trim() === '')) return 'every field must be non-empty';
  if (!Number.isInteger(exception.maxCodeLines) || exception.maxCodeLines < HARD_LIMIT) return `maxCodeLines must be an integer of at least ${String(HARD_LIMIT)}`;
  return undefined;
}

function isMeasuredType(node: ts.Node): boolean {
  return ts.isClassLike(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node) || ts.isTypeAliasDeclaration(node);
}

/** Name contributed to qualified identities; undefined for nodes that do not form a scope. */
function scopeName(node: ts.Node, ast: ts.SourceFile): string | undefined {
  if (ts.isClassLike(node) || ts.isFunctionLike(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) || ts.isModuleDeclaration(node) || ts.isVariableDeclaration(node)) {
    if (node.name && !ts.isComputedPropertyName(node.name) && !ts.isObjectBindingPattern(node.name) && !ts.isArrayBindingPattern(node.name)) {
      return node.name.text;
    }
    if (ts.isConstructorDeclaration(node)) return 'constructor';
    if (ts.isVariableDeclaration(node.parent)) return undefined;
    if (ts.isClassDeclaration(node) && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) return 'default';
    const { line, character } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
    return `<anonymous@${String(line + 1)}:${String(character + 1)}>`;
  }
  return undefined;
}

/** Zero-based lines holding non-whitespace token text. Comments are trivia and never count. */
function tokenLines(ast: ts.SourceFile): Set<number> {
  const lines = new Set<number>();
  const visit = (node: ts.Node): void => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = node.getChildren(ast);
    if (children.length > 0) {
      children.forEach(visit);
      return;
    }
    const start = node.getStart(ast);
    const firstLine = ast.getLineAndCharacterOfPosition(start).line;
    ast.text.slice(start, node.getEnd()).split('\n').forEach((text, offset) => {
      if (text.trim() !== '') lines.add(firstLine + offset);
    });
  };
  visit(ast);
  return lines;
}

if (import.meta.main) {
  const report = checkTypeSizes(process.cwd());
  report.warnings.forEach((warning) => {
    console.warn(`WARN ${warning}`);
  });
  report.failures.forEach((failure) => {
    console.error(`FAIL ${failure}`);
  });
  console.log(`Type size: ${String(report.measures.length)} types, ${String(report.warnings.length)} warnings, ${String(report.failures.length)} failures`);
  process.exitCode = report.failures.length > 0 ? 1 : 0;
}
