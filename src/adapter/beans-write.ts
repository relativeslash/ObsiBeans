import { fnv1a64, unsafeReason } from './beans-guard.ts';
import { runGraphql, ShapeError, NOTHING_WRITTEN, record, text, type BeansContext, type Failure } from './beans-graphql.ts';
import {
  fail,
  invalid,
  ok,
  checkFields,
  checkTitle,
  type AdapterError,
  type BeanDetail,
  type Outcome,
} from './beans-model.ts';
import { DETAIL_FIELDS, assemble, checkId, getBean, indexTaskRoot, parseCore, queryShape, readBeanFile, readError, type Core, type TaskIndex } from './beans-read.ts';

/** A change to one bean. Each is exactly one Beans mutation, because a multi-field document is not atomic and loses its output (BC-25). */
export type Change =
  | {
      readonly kind: 'fields';
      readonly title?: string;
      readonly status?: string;
      readonly type?: string;
      readonly priority?: string;
      /** The complete list, in the user's order. Beans' `addTags` would reorder it. */
      readonly tags?: readonly string[];
    }
  /** Replaces the whole description. Newline normalization is the caller's job. */
  | { readonly kind: 'body'; readonly body: string }
  /** Sets one checklist item. `line` is the 0-based line of the body as read; `text` is that line as the user saw it. */
  | { readonly kind: 'checklist'; readonly line: number; readonly text: string; readonly checked: boolean }
  | { readonly kind: 'parent'; readonly parentId: string | null }
  /** Edits the `blocking` or `blocked_by` list stored in this bean's own file. Removal must use the field that stores the link. */
  | { readonly kind: 'blocking'; readonly field: 'blocking' | 'blocked-by'; readonly action: 'add' | 'remove'; readonly targetId: string };

export interface NewBean {
  readonly title: string;
  /** Defaults to the project's `default_type`, or `task`. */
  readonly type?: string;
  /** Defaults to the project's `default_status`, or `todo`. */
  readonly status?: string;
  readonly priority?: string;
  readonly tags?: readonly string[];
  readonly body?: string;
  readonly parentId?: string;
  readonly blockingIds?: readonly string[];
  readonly blockedByIds?: readonly string[];
}

const UPDATE = `mutation($id: ID!, $input: UpdateBeanInput!) { updateBean(id: $id, input: $input) { ${DETAIL_FIELDS} } }`;
const SET_PARENT = `mutation($id: ID!, $parent: String, $ifMatch: String) { setParent(id: $id, parentId: $parent, ifMatch: $ifMatch) { ${DETAIL_FIELDS} } }`;
const CREATE = `mutation($input: CreateBeanInput!) { createBean(input: $input) { ${DETAIL_FIELDS} } }`;
const BODY_QUERY = 'query($id: ID!) { bean(id: $id) { body } }';
const LINK_MUTATIONS = {
  blocking: { add: 'addBlocking', remove: 'removeBlocking' },
  'blocked-by': { add: 'addBlockedBy', remove: 'removeBlockedBy' },
} as const;
const linkQuery = (name: string): string =>
  `mutation($id: ID!, $target: ID!, $ifMatch: String) { ${name}(id: $id, targetId: $target, ifMatch: $ifMatch) { ${DETAIL_FIELDS} } }`;
const CHECKLIST_ITEM = /^(\s*[-*+] \[)[ xX](\][\s\S]*)$/;

type Written = { readonly ok: true; readonly core: Core; readonly body: string } | { readonly ok: false; readonly failure: Failure };

/** Runs one mutation and parses its answer. An answer that does not parse counts as a failure with unknown outcome. */
async function runMutation(ctx: BeansContext, query: string, variables: Record<string, unknown>, field: string): Promise<Written> {
  const result = await runGraphql(ctx, query, variables);
  if (!result.ok) return result;
  try {
    const bean = record(result.data[field], field);
    return { ok: true, core: parseCore(bean), body: text(bean, 'body') };
  } catch (error) {
    if (!(error instanceof ShapeError)) throw error;
    return { ok: false, failure: { reason: 'invalid-response', message: error.message } };
  }
}

/**
 * The bean after a successful write, read back so the body has the same shape as every other read (a mutation's
 * own answer lacks the leading newline). Falls back to that answer if the read-back fails; the write already happened.
 */
async function readBack(ctx: BeansContext, written: Extract<Written, { ok: true }>, index: TaskIndex): Promise<BeanDetail> {
  const found = await getBean(settled(ctx), written.core.id);
  return found.ok && found.value !== null ? found.value : { ...(await assemble(ctx, written.core, index)), body: written.body };
}

/** Re-reads after a failure must still work when the failure was a cancellation. */
const settled = (ctx: BeansContext): BeansContext => ({ runner: ctx.runner, binding: ctx.binding, parseYaml: ctx.parseYaml, ...(ctx.timeoutMs && { timeoutMs: ctx.timeoutMs }) });

async function currentOf(ctx: BeansContext, id: string | undefined): Promise<BeanDetail | null> {
  if (id === undefined) return null;
  const found = await getBean(settled(ctx), id);
  return found.ok ? found.value : null;
}

/** Translates the failures after which nothing was written. Returns undefined for the others. */
async function refusal(ctx: BeansContext, failure: Failure, id?: string): Promise<AdapterError | undefined> {
  if (!NOTHING_WRITTEN.includes(failure.reason)) return undefined;
  if (failure.reason === 'etag' || failure.reason === 'body') return { kind: 'conflict', code: failure.reason, current: await currentOf(ctx, id) };
  return readError(failure);
}

const conflict = async (ctx: BeansContext, id: string): Promise<Outcome<never>> =>
  fail({ kind: 'conflict', code: 'revision', current: await currentOf(ctx, id) });

/** The description as the checklist change expects it, or the reason it cannot be applied. */
function toggled(body: string, change: Extract<Change, { kind: 'checklist' }>): { readonly next: string } | { readonly problem: 'changed' | 'not-an-item' } {
  const lines = body.split('\n');
  if (lines[change.line] !== change.text) return { problem: 'changed' };
  const item = CHECKLIST_ITEM.exec(change.text);
  if (!item) return { problem: 'not-an-item' };
  lines[change.line] = `${item[1] ?? ''}${change.checked ? 'x' : ' '}${item[2] ?? ''}`;
  return { next: lines.join('\n') };
}

function changeProblem(ctx: BeansContext, id: string, change: Change): string | undefined {
  const idProblem = checkId(ctx, id);
  if (idProblem !== undefined) return idProblem;
  switch (change.kind) {
    case 'fields':
      return change.title === undefined && change.status === undefined && change.type === undefined && change.priority === undefined && change.tags === undefined
        ? 'There is nothing to change.'
        : checkFields(change);
    case 'body':
      return undefined;
    case 'checklist':
      return Number.isInteger(change.line) && change.line >= 0 ? undefined : 'The checklist line must be a whole number.';
    case 'parent':
      return change.parentId === null ? undefined : change.parentId === id ? 'A bean cannot be its own parent.' : checkId(ctx, change.parentId);
    case 'blocking':
      return change.targetId === id ? 'A bean cannot block itself.' : checkId(ctx, change.targetId);
  }
}

/** The one Beans document that applies `change`. Every document carries the guarding `ifMatch`. */
async function document(ctx: BeansContext, id: string, revision: string, change: Change): Promise<Outcome<{ query: string; variables: Record<string, unknown>; field: string }>> {
  const update = (input: Record<string, unknown>): Outcome<{ query: string; variables: Record<string, unknown>; field: string }> =>
    ok({ query: UPDATE, variables: { id, input: { ...input, ifMatch: revision } }, field: 'updateBean' });
  switch (change.kind) {
    case 'fields':
      return update(Object.fromEntries(Object.entries(change).filter(([key]) => key !== 'kind')));
    case 'body':
      return update({ body: change.body });
    case 'parent':
      return ok({ query: SET_PARENT, variables: { id, parent: change.parentId, ifMatch: revision }, field: 'setParent' });
    case 'blocking': {
      const name = LINK_MUTATIONS[change.field][change.action];
      return ok({ query: linkQuery(name), variables: { id, target: change.targetId, ifMatch: revision }, field: name });
    }
    case 'checklist': {
      const current = await queryShape(ctx, BODY_QUERY, { id }, (data) => (data.bean === null ? null : text(record(data.bean, 'bean'), 'body')));
      if (!current.ok) return current;
      if (current.value === null) return conflict(ctx, id);
      const next = toggled(current.value, change);
      if ('problem' in next) {
        return next.problem === 'changed' ? fail({ kind: 'conflict', code: 'body', current: await currentOf(ctx, id) }) : invalid('That line is not a checklist item.');
      }
      // The whole body occurs exactly once, so the replacement targets one position even when item text repeats.
      return update({ bodyMod: { replace: [{ old: current.value, new: next.next }] } });
    }
  }
}

/**
 * Applies one change to one bean, guarded by `revision`: the value `BeanSummary.revision` had when the caller read
 * the bean. If the file differs now, nothing runs and the result is a `conflict` carrying the current bean.
 * Beans re-checks the same value as `ifMatch`, so a competing write that lands in between is rejected too.
 * A failure never discards the caller's input; after a failure that may have written, the file is re-read
 * and the answer is `uncertain` unless the bytes prove nothing changed.
 */
export async function mutateBean(ctx: BeansContext, id: string, revision: string, change: Change): Promise<Outcome<BeanDetail>> {
  const problem = changeProblem(ctx, id, change);
  if (problem !== undefined) return invalid(problem);
  const index = await indexTaskRoot(ctx);
  if (!index.ok) return index;
  const guarded = await guard(ctx, index.value, id, revision);
  if (!guarded.ok) return guarded;
  const built = await document(ctx, id, revision, change);
  if (!built.ok) return built;

  const written = await runMutation(ctx, built.value.query, built.value.variables, built.value.field);
  if (written.ok) return ok(await readBack(ctx, written, index.value));
  const refused = await refusal(ctx, written.failure, id);
  return refused ? fail(refused) : afterUncertainWrite(ctx, index.value, id, revision, written.failure);
}

/** Checks that the file still has the revision the caller saw, and that Beans can rewrite it without loss. */
async function guard(ctx: BeansContext, index: TaskIndex, id: string, revision: string): Promise<Outcome<null>> {
  const path = index.pathOfId.get(id);
  if (path === undefined) {
    return index.duplicateIds.has(id)
      ? fail({ kind: 'preservation', code: 'invalid-bean', detail: 'Two files have this bean ID.' })
      : conflict(ctx, id);
  }
  const bytes = await readBeanFile(ctx, path);
  if (bytes === undefined || fnv1a64(bytes) !== revision) return conflict(ctx, id);
  const reason = unsafeReason(bytes, id, ctx.parseYaml);
  return reason === undefined ? ok(null) : fail({ kind: 'preservation', code: 'unsafe-frontmatter', detail: reason });
}

async function afterUncertainWrite(ctx: BeansContext, index: TaskIndex, id: string, revision: string, failure: Failure): Promise<Outcome<never>> {
  const path = index.pathOfId.get(id) ?? '';
  const bytes = await readBeanFile(ctx, path);
  if (bytes !== undefined && fnv1a64(bytes) === revision) return fail(readError(failure));
  return fail({ kind: 'uncertain', message: failure.message, current: await currentOf(ctx, id), createdIds: [] });
}

function newBeanProblem(ctx: BeansContext, bean: NewBean): string | undefined {
  const problem = checkTitle(bean.title) ?? checkFields(bean);
  if (problem !== undefined) return problem;
  const related = [...(bean.parentId === undefined ? [] : [bean.parentId]), ...(bean.blockingIds ?? []), ...(bean.blockedByIds ?? [])];
  return related.map((id) => checkId(ctx, id)).find((found) => found !== undefined);
}

/**
 * Creates one bean with explicit status, type and priority, because Beans' GraphQL ignores the project defaults.
 * Beans offers no `ifMatch` for creation, so this path is unguarded: a retry after an uncertain result could
 * create a duplicate. The `uncertain` error lists the IDs that appeared, so the caller reconciles before retrying.
 */
export async function createBean(ctx: BeansContext, bean: NewBean): Promise<Outcome<BeanDetail>> {
  const problem = newBeanProblem(ctx, bean);
  if (problem !== undefined) return invalid(problem);
  const before = await indexTaskRoot(ctx);
  if (!before.ok) return before;
  const input = {
    title: bean.title,
    status: bean.status ?? ctx.binding.defaults.status,
    type: bean.type ?? ctx.binding.defaults.type,
    priority: bean.priority ?? 'normal',
    ...(bean.tags && { tags: bean.tags }),
    ...(bean.body !== undefined && { body: bean.body }),
    ...(bean.parentId !== undefined && { parent: bean.parentId }),
    ...(bean.blockingIds && { blocking: bean.blockingIds }),
    ...(bean.blockedByIds && { blockedBy: bean.blockedByIds }),
  };

  const written = await runMutation(ctx, CREATE, { input }, 'createBean');
  if (written.ok) {
    const after = await indexTaskRoot(settled(ctx));
    return after.ok ? ok(await readBack(ctx, written, after.value)) : after;
  }
  const refused = await refusal(ctx, written.failure);
  if (refused) return fail(refused);

  const after = await indexTaskRoot(settled(ctx));
  const known = new Set(before.value.idOfPath.values());
  const createdIds = after.ok ? [...new Set(after.value.idOfPath.values())].filter((id) => !known.has(id)) : [];
  if (after.ok && createdIds.length === 0) return fail(readError(written.failure));
  return fail({ kind: 'uncertain', message: written.failure.message, current: createdIds.length === 1 ? await currentOf(ctx, createdIds[0]) : null, createdIds });
}
