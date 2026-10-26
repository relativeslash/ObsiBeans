/** Beans' fixed value lists. They are compiled into the binary, not configuration (Beans 0.4.2 contract). */
export const STATUSES = ['in-progress', 'todo', 'draft', 'completed', 'scrapped'] as const;
export const TYPES = ['milestone', 'epic', 'bug', 'feature', 'task'] as const;
export const PRIORITIES = ['critical', 'high', 'normal', 'low', 'deferred'] as const;
/** The tag rule Beans documents but never enforces. */
export const TAG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** Beans takes the query and variables as one argument each; stay well below Linux's 128 KiB per-argument limit. */
export const MAX_VARIABLES_BYTES = 100_000;

/** Why a bean is shown but must not be edited. */
export type BeanProblem =
  | 'invalid-file' // the file is not a valid bean file of this project, so Beans' own view of it cannot be trusted
  | 'duplicate-id' // another file has the same ID; Beans silently shadows one of them
  | 'unreadable' // the file could not be read, so no revision exists
  | 'bad-value'; // an empty or unknown status, type or priority, or an invalid tag

/** One bean as listed. No body: rows must not load every description. */
export interface BeanSummary {
  /** Full bean ID, the stable identity. Never a sequence number. */
  readonly id: string;
  readonly slug: string;
  /** Relative to the task root, with `/` separators. */
  readonly path: string;
  readonly title: string;
  readonly status: string;
  readonly type: string;
  readonly priority: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly parentId: string | null;
  /** Stored in this bean's own `blocking` field. */
  readonly blockingIds: readonly string[];
  /** Stored in this bean's own `blocked_by` field. */
  readonly blockedByIds: readonly string[];
  /** Beans whose `blocking` field names this bean. Together with `blockedByIds` this is the full blocked-by set. */
  readonly blockedByLinkIds: readonly string[];
  readonly childIds: readonly string[];
  /**
   * FNV-1a 64 of the exact file bytes read, the only value Beans accepts as `ifMatch` for every file. Pass it back
   * as the basis of a mutation. Beans' own queried `etag` is deliberately not exposed. Null when unreadable.
   */
  readonly revision: string | null;
  /** Empty when the bean may be edited. */
  readonly problems: readonly BeanProblem[];
}

export interface BeanDetail extends BeanSummary {
  /** As Beans returns it: one leading newline, no trailing newline. */
  readonly body: string;
}

/** Why a call failed. No call ever discards the caller's input, so a draft survives every variant. */
export type AdapterError =
  /** Input or backend validation rejected the request. Nothing was written. */
  | { readonly kind: 'validation'; readonly code: 'input' | 'backend'; readonly message: string }
  /** The file changed since the caller read it, or Beans rejected the ETag, or a body replacement no longer matches. Nothing was written. */
  | { readonly kind: 'conflict'; readonly code: 'revision' | 'etag' | 'body'; readonly current: BeanDetail | null }
  /** Writing would drop data or act on an untrustworthy file. Nothing was written. */
  | { readonly kind: 'preservation'; readonly code: 'unsafe-frontmatter' | 'invalid-bean'; readonly detail: string }
  /** The backend failed without changing the bean (or a read failed). */
  | { readonly kind: 'backend'; readonly code: BackendFailure; readonly message: string }
  /** A write may have been applied. Reconcile with `current` instead of retrying blindly. `current` is null when it could not be re-read. */
  | { readonly kind: 'uncertain'; readonly message: string; readonly current: BeanDetail | null; readonly createdIds: readonly string[] };

export type BackendFailure =
  | 'unavailable'
  | 'timeout'
  | 'cancelled'
  | 'output-limit'
  | 'invalid-data'
  | 'invalid-response'
  | 'task-root'
  | 'failed';

export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AdapterError };

export const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
export const fail = (error: AdapterError): { readonly ok: false; readonly error: AdapterError } => ({ ok: false, error });
export const invalid = (message: string): { readonly ok: false; readonly error: AdapterError } =>
  fail({ kind: 'validation', code: 'input', message });

export const isOneOf = (list: readonly string[], value: unknown): value is string => typeof value === 'string' && list.includes(value);

/** Local value validation, because Beans validates none of these (BC-10 to BC-13). Returns the problem, if any. */
export function checkTitle(title: string): string | undefined {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected
  return title.trim() === '' ? 'The title must not be empty.' : /[\u0000-\u001f\u007f]/.test(title) ? 'The title must be a single line.' : undefined;
}

export function checkTags(tags: readonly string[]): string | undefined {
  const bad = tags.find((tag) => !TAG_PATTERN.test(tag));
  if (bad !== undefined) return `Tag "${bad}" must be lowercase words joined by hyphens.`;
  return new Set(tags).size === tags.length ? undefined : 'Tags must be unique.';
}

/** Checks each supplied field; absent fields are left alone. */
export function checkFields(fields: {
  readonly title?: string;
  readonly status?: string;
  readonly type?: string;
  readonly priority?: string;
  readonly tags?: readonly string[];
}): string | undefined {
  const { title, status, type, priority, tags } = fields;
  const titleProblem = title === undefined ? undefined : checkTitle(title);
  if (titleProblem !== undefined) return titleProblem;
  const checks: [string | undefined, readonly string[], string][] = [
    [status, STATUSES, 'status'],
    [type, TYPES, 'type'],
    [priority, PRIORITIES, 'priority'],
  ];
  for (const [value, list, name] of checks) if (value !== undefined && !list.includes(value)) return `"${value}" is not a ${name}.`;
  return tags === undefined ? undefined : checkTags(tags);
}
