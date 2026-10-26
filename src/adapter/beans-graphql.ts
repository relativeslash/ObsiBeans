import { BEANS_TIMEOUT_MS, runBeans, type Binding } from './binding.ts';
import { MAX_VARIABLES_BYTES } from './beans-model.ts';
import type { ProcessRunner } from './process.ts';

/** Everything the Beans adapter needs from the plugin shell. One per bound project. */
export interface BeansContext {
  readonly runner: ProcessRunner;
  readonly binding: Binding;
  /** Obsidian's `parseYaml`, injected because the adapter has no Obsidian dependency. */
  readonly parseYaml: (text: string) => unknown;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

/**
 * Why a Beans call failed, classified from the exit status and the message prefix, because Beans reports errors
 * as unstructured strings (Beans 0.4.2 contract, "Adapter decisions"). The first six reasons mean nothing was written.
 */
export type FailureReason =
  | 'input'
  | 'unavailable'
  | 'etag'
  | 'body'
  | 'validation'
  | 'invalid-data'
  /** Beans reported a failed write or an unclassified error; the file may or may not have changed. */
  | 'write-failed'
  | 'failed'
  | 'timeout'
  | 'cancelled'
  | 'output-limit'
  /** Exit 0, but the output is not what the schema promises. */
  | 'invalid-response';

export interface Failure {
  readonly reason: FailureReason;
  readonly message: string;
}

export type GraphqlResult = { readonly ok: true; readonly data: Readonly<Record<string, unknown>> } | { readonly ok: false; readonly failure: Failure };

/** Reasons after which the bean file is certainly unchanged. */
export const NOTHING_WRITTEN: readonly FailureReason[] = ['input', 'unavailable', 'etag', 'body', 'validation', 'invalid-data'];

const MESSAGE_RULES: readonly (readonly [RegExp, FailureReason])[] = [
  [/^(etag mismatch|if-match etag is required)/, 'etag'],
  [/^replacement \d+ failed/, 'body'],
  [/^loading beans:/, 'invalid-data'],
  [/^writing file:/, 'write-failed'],
  [/would create cycle|cannot have a parent|can only have|not found/, 'validation'],
];

/** Pulls the message out of `Error: graphql: <message>` (or `Error: <message>`) on the first line of stderr. */
export function classifyMessage(stderr: string): Failure {
  const message = (/^Error: (?:graphql: )?(.*)$/m.exec(stderr)?.[1] ?? stderr.split('\n', 1)[0] ?? '').trim();
  return { reason: MESSAGE_RULES.find(([pattern]) => pattern.test(message))?.[1] ?? 'failed', message };
}

const fail = (reason: FailureReason, message: string): GraphqlResult => ({ ok: false, failure: { reason, message } });

/**
 * Runs one GraphQL document. User data travels only in `variables`; the query text is always one of this
 * adapter's own constants. The result is parsed JSON `data`, never trusted beyond that.
 */
export async function runGraphql(ctx: BeansContext, query: string, variables: Readonly<Record<string, unknown>> = {}): Promise<GraphqlResult> {
  const json = JSON.stringify(variables);
  if (Buffer.byteLength(json) > MAX_VARIABLES_BYTES) return fail('input', 'The request is too large for Beans.');
  const result = await runBeans(ctx.runner, ctx.binding, 'graphql', ['-v', json, query], {
    timeoutMs: ctx.timeoutMs ?? BEANS_TIMEOUT_MS,
    ...(ctx.signal && { signal: ctx.signal }),
  });
  switch (result.kind) {
    case 'spawn-failed':
      return fail('unavailable', result.message);
    case 'timeout':
    case 'cancelled':
    case 'output-limit':
      return fail(result.kind, `Beans call ${result.kind}`);
    case 'exited': {
      if (result.code !== 0) return { ok: false, failure: classifyMessage(result.stderr) };
      try {
        const data: unknown = JSON.parse(result.stdout);
        if (typeof data === 'object' && data !== null && !Array.isArray(data)) return { ok: true, data: data as Record<string, unknown> };
      } catch {
        // falls through to the shape failure below
      }
      return fail('invalid-response', 'Beans printed something other than a JSON object.');
    }
  }
}

/** Thrown by the field readers below; always caught at the boundary that parses a whole response. */
export class ShapeError extends Error {}

type Fields = Readonly<Record<string, unknown>>;

export function record(value: unknown, what: string): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ShapeError(`${what} is not an object`);
  return value as Fields;
}

export function text(fields: Fields, key: string): string {
  const value = fields[key];
  if (typeof value !== 'string') throw new ShapeError(`${key} is not a string`);
  return value;
}

export function textOrNull(fields: Fields, key: string): string | null {
  return fields[key] === null ? null : text(fields, key);
}

function items(fields: Fields, key: string): readonly unknown[] {
  const value = fields[key];
  if (!Array.isArray(value)) throw new ShapeError(`${key} is not a list`);
  return value as unknown[];
}

export function texts(fields: Fields, key: string): string[] {
  return items(fields, key).map((value) => {
    if (typeof value !== 'string') throw new ShapeError(`${key} holds a non-string`);
    return value;
  });
}

/** IDs of a list of nested beans such as `children { id }`. */
export function ids(fields: Fields, key: string): string[] {
  return items(fields, key).map((value) => text(record(value, key), 'id'));
}

export function list(fields: Fields, key: string): readonly Fields[] {
  return items(fields, key).map((value) => record(value, key));
}
