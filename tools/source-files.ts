import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { parse } from 'svelte/compiler';
import ts from 'typescript';

export const SOURCE_ROOTS = ['src', 'test', 'tools'] as const;

const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.svelte']);

export interface SourceFile {
  /** Repository-relative path with forward slashes. */
  readonly path: string;
  readonly ast: ts.SourceFile;
}

/**
 * Loads every owned source file: the required roots recursively plus top-level build configuration files.
 * Top-level dotfiles such as the generated `.pnp.cjs` are package-manager output, not owned source.
 * Throws when a required root is missing or a file cannot be parsed, so a gate never passes on missing input.
 */
export function loadSources(root: string, roots: readonly string[] = SOURCE_ROOTS): SourceFile[] {
  const files: string[] = [];
  for (const sourceRoot of roots) {
    const dir = join(root, sourceRoot);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`Required source root is missing: ${sourceRoot}`);
    files.push(...walk(dir));
  }
  files.push(...readdirSync(root).filter((name) => !name.startsWith('.')).map((name) => join(root, name))
    .filter((file) => isSource(file) && statSync(file).isFile()));
  return files.sort().map((file) => parseSource(relative(root, file).split(sep).join('/'), readFileSync(file, 'utf8')));
}

export function parseSource(path: string, text: string): SourceFile {
  const script = path.endsWith('.svelte') ? svelteScripts(path, text) : text;
  const syntaxErrors = ts.transpileModule(script, { fileName: path.replace(/\.svelte$/, '.svelte.ts'), reportDiagnostics: true }).diagnostics ?? [];
  if (syntaxErrors.length > 0) {
    throw new Error(`Cannot parse ${path}: ${ts.flattenDiagnosticMessageText(syntaxErrors[0]?.messageText, '\n')}`);
  }
  const kind = /\.[mc]?js$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  return { path, ast: ts.createSourceFile(path, script, ts.ScriptTarget.Latest, true, kind) };
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return isSource(path) ? [path] : [];
  });
}

function isSource(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(path)) && !path.endsWith('.d.ts');
}

/** Blanks everything outside `<script>` contents while keeping line and column positions. */
function svelteScripts(path: string, text: string): string {
  let ast;
  try {
    ast = parse(text, { modern: true, filename: path });
  } catch (error) {
    throw new Error(`Cannot parse ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  const ranges = [ast.instance, ast.module].flatMap((script) => {
    if (!script) return [];
    const { content } = script;
    if (!('start' in content) || !('end' in content) || typeof content.start !== 'number' || typeof content.end !== 'number') {
      throw new Error(`Cannot locate script content in ${path}`);
    }
    return [[content.start, content.end] as const];
  });
  return text.replace(/[^\n]/g, (char, offset: number) => (ranges.some(([start, end]) => offset >= start && offset < end) ? char : ' '));
}
