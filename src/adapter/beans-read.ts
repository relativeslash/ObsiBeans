import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fnv1a64 } from './beans-guard.ts';
import { ShapeError, ids, list, record, runGraphql, text, textOrNull, texts, type BeansContext, type Failure } from './beans-graphql.ts';
import {
  PRIORITIES,
  STATUSES,
  TAG_PATTERN,
  TYPES,
  fail,
  invalid,
  isOneOf,
  ok,
  type AdapterError,
  type BeanDetail,
  type BeanProblem,
  type BeanSummary,
  type Outcome,
} from './beans-model.ts';
import { scanTaskRoot, type InvalidTaskFile } from './task-root.ts';

const FIELDS =
  'id slug path title status type priority tags createdAt updatedAt parentId blockingIds blockedByIds blockedBy { id } children { id }';
/** GraphQL selection for one bean with its description. */
export const DETAIL_FIELDS = `${FIELDS} body`;
const LIST_QUERY = `query($filter: BeanFilter) { beans(filter: $filter) { ${FIELDS} } }`;
const DETAIL_QUERY = `query($id: ID!) { bean(id: $id) { ${DETAIL_FIELDS} } }`;
const REVISION_BATCH = 64;

/** Beans' `BeanFilter`, passed through as a variable. `search` is raw Bleve syntax; escaping user text is the caller's job. */
export interface BeanFilter {
  readonly search?: string;
  readonly status?: readonly string[];
  readonly excludeStatus?: readonly string[];
  readonly type?: readonly string[];
  readonly excludeType?: readonly string[];
  readonly priority?: readonly string[];
  readonly excludePriority?: readonly string[];
  readonly tags?: readonly string[];
  readonly excludeTags?: readonly string[];
  readonly parentId?: string;
  readonly blockingId?: string;
  readonly blockedById?: string;
  readonly hasParent?: boolean;
  readonly noParent?: boolean;
  readonly hasBlocking?: boolean;
  readonly noBlocking?: boolean;
  readonly hasBlockedBy?: boolean;
  readonly noBlockedBy?: boolean;
  readonly isBlocked?: boolean;
}

/** What `beans list --ready` means (BC-39): not blocked, and not started, finished, dropped or still a draft. */
export const READY_FILTER: BeanFilter = { isBlocked: false, excludeStatus: ['in-progress', 'completed', 'scrapped', 'draft'] };

const ENUM_FILTERS: readonly (readonly [keyof BeanFilter, readonly string[]])[] = [
  ['status', STATUSES],
  ['excludeStatus', STATUSES],
  ['type', TYPES],
  ['excludeType', TYPES],
  ['priority', PRIORITIES],
  ['excludePriority', PRIORITIES],
];

/** Beans ignores a misspelled value and returns nothing or everything; refuse it instead. */
function filterProblem(filter: BeanFilter): string | undefined {
  for (const [key, allowed] of ENUM_FILTERS) {
    const bad = filter[key];
    if (Array.isArray(bad) && bad.some((value) => !allowed.includes(String(value)))) return `The ${key} filter has an unknown value.`;
  }
  return undefined;
}

/** What a scan of the task root says about the files, shared by reads and mutations. */
export interface TaskIndex {
  /** Valid bean file path to its bean ID. */
  readonly idOfPath: ReadonlyMap<string, string>;
  /** Valid bean file path of each ID that exactly one file carries. */
  readonly pathOfId: ReadonlyMap<string, string>;
  readonly duplicateIds: ReadonlySet<string>;
  readonly invalid: readonly InvalidTaskFile[];
}

/** Lists the task root. Never follows symbolic links and never reads content. */
export async function indexTaskRoot(ctx: BeansContext): Promise<Outcome<TaskIndex>> {
  const { prefix, idLength, taskRoot } = ctx.binding;
  const result = await scanTaskRoot(taskRoot, { prefix, idLength, ...(ctx.signal && { signal: ctx.signal }) });
  if (!result.ok) {
    return fail({ kind: 'backend', code: result.code === 'cancelled' ? 'cancelled' : 'task-root', message: result.code });
  }
  const idOfPath = new Map(result.scan.files.map((file) => [file.path, file.id]));
  const counts = new Map<string, number>();
  for (const { id } of result.scan.files) counts.set(id, (counts.get(id) ?? 0) + 1);
  const duplicateIds = new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
  const pathOfId = new Map(result.scan.files.filter((file) => !duplicateIds.has(file.id)).map((file) => [file.id, file.path]));
  return ok({ idOfPath, pathOfId, duplicateIds, invalid: result.scan.invalid });
}

/** The exact bytes of a bean file, or undefined when it cannot be read. `path` must come from `indexTaskRoot`. */
export async function readBeanFile(ctx: BeansContext, path: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(join(ctx.binding.taskRoot, path));
  } catch {
    return undefined;
  }
}

async function revisionOf(ctx: BeansContext, path: string, index: TaskIndex): Promise<string | null> {
  if (!index.idOfPath.has(path)) return null;
  const bytes = await readBeanFile(ctx, path);
  return bytes === undefined ? null : fnv1a64(bytes);
}

export type Core = Omit<BeanSummary, 'revision' | 'problems'>;

export function parseCore(value: unknown): Core {
  const fields = record(value, 'bean');
  return {
    id: text(fields, 'id'),
    slug: textOrNull(fields, 'slug') ?? '',
    path: text(fields, 'path').replaceAll('\\', '/'),
    title: text(fields, 'title'),
    status: text(fields, 'status'),
    type: text(fields, 'type'),
    priority: text(fields, 'priority'),
    tags: texts(fields, 'tags'),
    createdAt: text(fields, 'createdAt'),
    updatedAt: text(fields, 'updatedAt'),
    parentId: textOrNull(fields, 'parentId'),
    blockingIds: texts(fields, 'blockingIds'),
    blockedByIds: texts(fields, 'blockedByIds'),
    blockedByLinkIds: ids(fields, 'blockedBy'),
    childIds: ids(fields, 'children'),
  };
}

function problemsOf(core: Core, index: TaskIndex, revision: string | null): BeanProblem[] {
  const problems: BeanProblem[] = [];
  if (index.idOfPath.get(core.path) !== core.id) problems.push('invalid-file');
  if (index.duplicateIds.has(core.id)) problems.push('duplicate-id');
  if (revision === null && !problems.includes('invalid-file')) problems.push('unreadable');
  const values = isOneOf(STATUSES, core.status) && isOneOf(TYPES, core.type) && isOneOf(PRIORITIES, core.priority);
  if (!values || !core.tags.every((tag) => TAG_PATTERN.test(tag))) problems.push('bad-value');
  return problems;
}

/** Combines what Beans says with what the file system says. */
export async function assemble(ctx: BeansContext, core: Core, index: TaskIndex): Promise<BeanSummary> {
  const revision = await revisionOf(ctx, core.path, index);
  return { ...core, revision, problems: problemsOf(core, index, revision) };
}

async function assembleAll(ctx: BeansContext, cores: readonly Core[], index: TaskIndex): Promise<BeanSummary[]> {
  const beans: BeanSummary[] = [];
  for (let start = 0; start < cores.length; start += REVISION_BATCH) {
    beans.push(...(await Promise.all(cores.slice(start, start + REVISION_BATCH).map((core) => assemble(ctx, core, index)))));
  }
  return beans;
}

/** Read-side translation. Reasons that only a write can produce read as a plain failure. */
export function readError({ reason, message }: Failure): AdapterError {
  switch (reason) {
    case 'input':
      return { kind: 'validation', code: 'input', message };
    case 'validation':
      return { kind: 'validation', code: 'backend', message };
    case 'unavailable':
    case 'timeout':
    case 'cancelled':
    case 'output-limit':
    case 'invalid-data':
    case 'invalid-response':
      return { kind: 'backend', code: reason, message };
    default:
      return { kind: 'backend', code: 'failed', message };
  }
}

/** Runs a query that answers with a shape this adapter parses; a wrong shape is `invalid-response`, never a crash. */
export async function queryShape<T>(ctx: BeansContext, query: string, variables: Record<string, unknown>, parse: (data: Readonly<Record<string, unknown>>) => T): Promise<Outcome<T>> {
  const result = await runGraphql(ctx, query, variables);
  if (!result.ok) return fail(readError(result.failure));
  try {
    return ok(parse(result.data));
  } catch (error) {
    if (!(error instanceof ShapeError)) throw error;
    return fail({ kind: 'backend', code: 'invalid-response', message: error.message });
  }
}

export interface ProjectRead {
  readonly beans: readonly BeanSummary[];
  /** Files Beans would load as beans but that are not valid bean files. Shown as invalid data. */
  readonly invalid: readonly InvalidTaskFile[];
  /** IDs with a blocker, stored on either side, that is not completed or scrapped (BC-38). Complete only for an unfiltered list. */
  readonly blockedIds: readonly string[];
  /** IDs `beans list --ready` would list (BC-39): not blocked and not in progress, completed, scrapped or draft. */
  readonly readyIds: readonly string[];
}

/**
 * Lists beans without their descriptions. Order is unspecified because Beans' is (Beans 0.4.2 contract); callers sort.
 * Pass `READY_FILTER` for readiness. Relationships are in each row; `blockingGraph` combines both stored directions.
 */
export async function listBeans(ctx: BeansContext, filter: BeanFilter = {}): Promise<Outcome<ProjectRead>> {
  const problem = filterProblem(filter);
  if (problem !== undefined) return invalid(problem);
  const [index, cores] = await Promise.all([
    indexTaskRoot(ctx),
    queryShape(ctx, LIST_QUERY, { filter }, (data) => list(data, 'beans').map(parseCore)),
  ]);
  if (!index.ok) return index;
  if (!cores.ok) return cores;
  const beans = await assembleAll(ctx, cores.value, index.value);
  return ok({ beans, invalid: index.value.invalid, ...readiness(beans) });
}

/** One bean with its description, or null when no such bean exists. `id` must be the full ID. */
export async function getBean(ctx: BeansContext, id: string): Promise<Outcome<BeanDetail | null>> {
  const idProblem = checkId(ctx, id);
  if (idProblem !== undefined) return invalid(idProblem);
  const [index, found] = await Promise.all([
    indexTaskRoot(ctx),
    queryShape(ctx, DETAIL_QUERY, { id }, (data) => {
      if (data.bean === null) return null;
      const fields = record(data.bean, 'bean');
      const core = parseCore(fields);
      if (core.id !== id) throw new ShapeError('Beans returned another bean');
      return { core, body: text(fields, 'body') };
    }),
  ]);
  if (!index.ok) return index;
  if (!found.ok) return found;
  return ok(found.value === null ? null : { ...(await assemble(ctx, found.value.core, index.value)), body: found.value.body });
}

/** Bean IDs are always full IDs: `<prefix><id_length characters>`. Short IDs would make the identity ambiguous. */
export function checkId(ctx: BeansContext, id: string): string | undefined {
  const { prefix, idLength } = ctx.binding;
  return id.length === prefix.length + idLength && id.startsWith(prefix) && /^[0-9a-z]+$/.test(id.slice(prefix.length))
    ? undefined
    : `"${id.slice(0, 40)}" is not a full bean ID.`;
}

const FINISHED = ['completed', 'scrapped'];

/**
 * Blocked and ready IDs, computed from the rows because Beans offers readiness only as a filter, which would cost a
 * second full project load. A blocker that does not exist does not block (observed on a development build).
 */
export function readiness(beans: readonly BeanSummary[]): Pick<ProjectRead, 'blockedIds' | 'readyIds'> {
  const statusOf = new Map(beans.map((bean) => [bean.id, bean.status]));
  const graph = blockingGraph(beans);
  const open = (id: string): boolean => {
    const status = statusOf.get(id);
    return status !== undefined && !FINISHED.includes(status);
  };
  const blocked = beans.filter((bean) => graph.get(bean.id)?.blockedBy.some(open));
  const blockedIds = blocked.map((bean) => bean.id);
  const blockedSet = new Set(blockedIds);
  const readyIds = beans.filter((bean) => !blockedSet.has(bean.id) && !READY_FILTER.excludeStatus?.includes(bean.status)).map((bean) => bean.id);
  return { blockedIds, readyIds };
}

export interface Blocking {
  readonly blocks: readonly string[];
  readonly blockedBy: readonly string[];
}

/**
 * Blocking is stored in two directions (BC-37). Given the complete list, returns for each bean what it blocks and
 * what blocks it, whichever side stored the link. A filtered list gives a partial graph.
 */
export function blockingGraph(beans: readonly BeanSummary[]): ReadonlyMap<string, Blocking> {
  const blocks = new Map<string, Set<string>>();
  const blockedBy = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, value: string): void => {
    map.set(key, (map.get(key) ?? new Set<string>()).add(value));
  };
  const link = (from: string, to: string): void => {
    add(blocks, from, to);
    add(blockedBy, to, from);
  };
  for (const bean of beans) {
    for (const target of bean.blockingIds) link(bean.id, target);
    for (const source of bean.blockedByIds) link(source, bean.id);
  }
  return new Map(beans.map((bean) => [bean.id, { blocks: [...(blocks.get(bean.id) ?? [])], blockedBy: [...(blockedBy.get(bean.id) ?? [])] }]));
}
