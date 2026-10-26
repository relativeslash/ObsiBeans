import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/** Directory entries examined before the scan gives up. ponytail: raise or stream if real projects exceed it. */
export const MAX_TASK_ENTRIES = 50_000;

export interface TaskFile {
  /** Path relative to the task root, with `/` separators. */
  readonly path: string;
  /** Full bean ID, taken from the filename. */
  readonly id: string;
}

/**
 * Beans loads every `.md` file under the task root as a bean, so a file whose name is not a bean ID, a symbolic
 * link, or an unreadable directory is invalid data. None of them may be mutated.
 */
export interface InvalidTaskFile {
  readonly path: string;
  readonly reason: 'name' | 'symlink' | 'unreadable';
}

export interface TaskScan {
  readonly files: readonly TaskFile[];
  readonly invalid: readonly InvalidTaskFile[];
}

export interface ScanOptions {
  readonly prefix: string;
  readonly idLength: number;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export type ScanResult =
  | { readonly ok: true; readonly scan: TaskScan }
  | { readonly ok: false; readonly code: 'task-root-too-large'; readonly limit: number }
  | { readonly ok: false; readonly code: 'cancelled' };

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/** Lists the task root without following symbolic links. Never reads file contents. */
export async function scanTaskRoot(taskRoot: string, options: ScanOptions): Promise<ScanResult> {
  const { prefix, idLength, limit = MAX_TASK_ENTRIES, signal } = options;
  const beanName = new RegExp(`^(${escapeRegExp(prefix)}[0-9a-z]{${String(idLength)}})(?:--.*)?\\.md$`);
  const files: TaskFile[] = [];
  const invalid: InvalidTaskFile[] = [];
  const pending = [taskRoot];
  let examined = 0;

  const display = (path: string): string => relative(taskRoot, path).split(sep).join('/') || '.';

  for (let directory = pending.pop(); directory !== undefined; directory = pending.pop()) {
    if (signal?.aborted) return { ok: false, code: 'cancelled' };
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      invalid.push({ path: display(directory), reason: 'unreadable' });
      continue;
    }
    examined += entries.length;
    if (examined > limit) return { ok: false, code: 'task-root-too-large', limit };
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) invalid.push({ path: display(path), reason: 'symlink' });
      else if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        const id = beanName.exec(entry.name)?.[1];
        if (id === undefined) invalid.push({ path: display(path), reason: 'name' });
        else files.push({ path: display(path), id });
      }
    }
  }

  const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { ok: true, scan: { files: files.sort(byPath), invalid: invalid.sort(byPath) } };
}
