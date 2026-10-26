import type { AdapterError, BeanDetail, BeanSummary, Outcome } from '../../src/adapter/beans-model.ts';
import type { ProjectRead } from '../../src/adapter/beans-read.ts';
import type { Change, NewBean } from '../../src/adapter/beans-write.ts';
import type { BeansPort, Draft } from '../../src/state/model.ts';
import { WorkspaceState, type WorkspaceStateOptions } from '../../src/state/workspace-state.ts';

export const VOCABULARY = {
  statuses: ['in-progress', 'todo', 'draft', 'completed', 'scrapped'],
  types: ['milestone', 'epic', 'bug', 'feature', 'task'],
  priorities: ['critical', 'high', 'normal', 'low', 'deferred'],
};

export const A = 'FX-aaaaa';
export const B = 'FX-bbbbb';
export const C = 'FX-ccccc';

/** A listed bean with sensible defaults. */
export function bean(id: string, extra: Partial<BeanSummary> = {}): BeanSummary {
  return {
    id,
    slug: id.toLowerCase(),
    path: `${id}--x.md`,
    title: `Title ${id}`,
    status: 'todo',
    type: 'task',
    priority: 'normal',
    tags: [],
    createdAt: '2026-10-26T20:00:00Z',
    updatedAt: '2026-10-26T20:00:00Z',
    parentId: null,
    blockingIds: [],
    blockedByIds: [],
    blockedByLinkIds: [],
    childIds: [],
    revision: `rev-${id}`,
    problems: [],
    ...extra,
  };
}

export const read = (beans: BeanSummary[], extra: Partial<ProjectRead> = {}): ProjectRead => ({
  beans,
  invalid: [],
  blockedIds: [],
  readyIds: beans.map((one) => one.id),
  ...extra,
});

export const detail = (id: string, extra: Partial<BeanDetail> = {}): BeanDetail => ({ ...bean(id), body: '\nBody', ...extra });

export const backend = (code: Extract<AdapterError, { kind: 'backend' }>['code'], message: string = code): AdapterError => ({ kind: 'backend', code, message });

/** One call a test controls: it stays pending until the test settles it. */
export interface Pending<T> {
  readonly args: readonly unknown[];
  readonly signal: AbortSignal | undefined;
  settle(outcome: Outcome<T>): void;
  reject(error: unknown): void;
}

function deferred<T>(args: readonly unknown[], signal?: AbortSignal): { call: Pending<T>; promise: Promise<Outcome<T>> } {
  let settle!: (outcome: Outcome<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Outcome<T>>((resolve, fail) => {
    settle = resolve;
    reject = fail;
  });
  return { call: { args, signal, settle, reject }, promise };
}

/** A Beans port whose every call waits for the test. */
export class FakePort implements BeansPort {
  readonly lists: Pending<ProjectRead>[] = [];
  readonly mutations: Pending<BeanDetail>[] = [];
  readonly creations: Pending<BeanDetail>[] = [];

  list(signal: AbortSignal): Promise<Outcome<ProjectRead>> {
    const { call, promise } = deferred<ProjectRead>([], signal);
    this.lists.push(call);
    return promise;
  }

  mutate(id: string, revision: string, change: Change): Promise<Outcome<BeanDetail>> {
    const { call, promise } = deferred<BeanDetail>([id, revision, change]);
    this.mutations.push(call);
    return promise;
  }

  create(bean: NewBean): Promise<Outcome<BeanDetail>> {
    const { call, promise } = deferred<BeanDetail>([bean]);
    this.creations.push(call);
    return promise;
  }

  /** The newest list call. */
  get lastList(): Pending<ProjectRead> {
    const call = this.lists.at(-1);
    if (!call) throw new Error('no list call');
    return call;
  }
}

export interface Harness {
  readonly state: WorkspaceState;
  readonly port: FakePort;
  /** Every complete draft list the state wrote to storage, oldest first. */
  readonly stored: (readonly Draft[])[];
}

/** A started-or-not state over a `FakePort`. Time is fixed so drafts have a known timestamp. */
export function harness(overrides: Partial<WorkspaceStateOptions> = {}): Harness {
  const port = new FakePort();
  const stored: (readonly Draft[])[] = [];
  const state = new WorkspaceState({
    port,
    vocabulary: VOCABULARY,
    taskRoot: 'Task root',
    drafts: [],
    saveDrafts: (drafts) => {
      stored.push(drafts);
      return Promise.resolve();
    },
    now: () => Date.UTC(2026, 9, 26, 20, 0, 0),
    ...overrides,
  });
  return { state, port, stored };
}

/** Starts the state and answers its first load with `beans`. */
export async function loaded(beans: BeanSummary[], extra: Partial<ProjectRead> = {}, overrides: Partial<WorkspaceStateOptions> = {}): Promise<Harness> {
  const made = harness(overrides);
  const started = made.state.start();
  made.port.lastList.settle({ ok: true, value: read(beans, extra) });
  await started;
  return made;
}
