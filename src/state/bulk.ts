import type { BeanSummary, BulkEdit, BulkItem, BulkRun, Change, MutationResult } from './model.ts';

/** What the runner needs from `WorkspaceState`. */
export interface BulkHost {
  bean(id: string): BeanSummary | undefined;
  mutate(id: string, change: Change, basis: string | undefined): Promise<MutationResult>;
  /** Re-reads the project; true when that succeeded. */
  reload(): Promise<boolean>;
  dismissSave(id: string): void;
  changed(): void;
  alive(): boolean;
}

export const changeOf = (edit: BulkEdit): Change => (edit.field === 'parent' ? { kind: 'parent', parentId: edit.parentId } : { kind: 'fields', [edit.field]: edit.value });

const alreadySet = (bean: BeanSummary, edit: BulkEdit): boolean => (edit.field === 'parent' ? bean.parentId === edit.parentId : bean[edit.field] === edit.value);

/**
 * Beans without a saved result: failed, conflicting, skipped and cancelled ones, and uncertain ones the user has
 * checked. A bean that is gone cannot be retried.
 */
export function retryable(item: BulkItem): boolean {
  return item.kind === 'failed' || item.kind === 'cancelled' || item.kind === 'conflict' || (item.kind === 'uncertain' && item.checked) || (item.kind === 'skipped' && item.reason !== 'unknown-bean' && item.reason !== 'disposed');
}

/**
 * Applies one edit to many beans as independent writes, one after another: every bean has its own precondition,
 * outcome and revision guard, and nothing here is transactional. Sequential on purpose (ponytail: one Beans process
 * at a time; raise the concurrency only if a real selection of hundreds is too slow), which also makes cancellation exact.
 */
export class BulkRunner {
  private readonly host: BulkHost;
  private run: BulkRun | null = null;

  constructor(host: BulkHost) {
    this.host = host;
  }

  get current(): BulkRun | null {
    return this.run;
  }

  /** Starts a run over `ids`. Refused while a run is shown, finished or not: its outcomes must be reviewed and closed first. */
  async start(edit: BulkEdit, ids: readonly string[]): Promise<boolean> {
    if (this.run !== null || ids.length === 0) return false;
    // The revision each bean had when the user chose to apply the change is the basis of its write.
    const bases = new Map(ids.map((id) => [id, this.host.bean(id)?.revision ?? undefined]));
    this.run = { edit, phase: 'running', items: ids.map((id) => ({ id, kind: 'pending' })), rereadFailed: false };
    this.host.changed();
    await this.drain(edit, bases);
    return true;
  }

  /** Stops before the next bean. Beans not yet started become `cancelled`; the one in flight reports what happened. */
  cancel(): void {
    const { run } = this;
    if (run?.phase !== 'running') return;
    this.run = { ...run, phase: 'cancelling', items: run.items.map((item): BulkItem => (item.kind === 'pending' ? { id: item.id, kind: 'cancelled' } : item)) };
    this.host.changed();
  }

  /**
   * Retries only what `retryable` allows, after re-reading the project. A bean that already has the value by then
   * is `unchanged` and gets no second write. When the re-read fails nothing is written.
   */
  async retry(): Promise<void> {
    const { run } = this;
    if (run?.phase !== 'done' || !run.items.some(retryable)) return;
    this.run = { ...run, phase: 'running', rereadFailed: false, items: run.items.map((item): BulkItem => (retryable(item) ? { id: item.id, kind: 'pending' } : item)) };
    this.host.changed();
    // ponytail: a write elsewhere can supersede this load, so the data may be a little old; the revision guard then reports a conflict.
    if (!(await this.host.reload())) {
      if (this.host.alive()) this.finish({ items: run.items, rereadFailed: true });
      return;
    }
    const bases = new Map(run.items.filter(retryable).map((item) => [item.id, this.host.bean(item.id)?.revision ?? undefined]));
    await this.drain(run.edit, bases);
  }

  /** The user compared an uncertain bean with the intent; it may be retried, and Beans accepts writes to it again. */
  reconcile(id: string): void {
    const { run } = this;
    if (run?.phase !== 'done') return;
    this.host.dismissSave(id);
    this.replace(id, (item) => (item.kind === 'uncertain' ? { ...item, checked: true } : item));
    this.host.changed();
  }

  /** Closes a finished run. */
  dismiss(): void {
    if (this.run?.phase !== 'done') return;
    this.run = null;
    this.host.changed();
  }

  private async drain(edit: BulkEdit, bases: ReadonlyMap<string, string | undefined>): Promise<void> {
    for (const { id } of this.run?.items ?? []) {
      if (!this.host.alive()) return;
      // Re-read each time: a cancel marks the rest while a bean is in flight.
      if (this.run?.items.find((item) => item.id === id)?.kind !== 'pending') continue;
      this.replace(id, () => ({ id, kind: 'running' }));
      this.host.changed();
      const item = await this.apply(id, edit, bases.get(id));
      if (!this.host.alive()) return;
      this.replace(id, () => item);
      this.host.changed();
    }
    this.finish();
  }

  private finish(patch: Partial<BulkRun> = {}): void {
    if (this.run) this.run = { ...this.run, ...patch, phase: 'done' };
    this.host.changed();
  }

  private replace(id: string, next: (item: BulkItem) => BulkItem): void {
    const { run } = this;
    if (run) this.run = { ...run, items: run.items.map((item) => (item.id === id ? next(item) : item)) };
  }

  private async apply(id: string, edit: BulkEdit, basis: string | undefined): Promise<BulkItem> {
    const bean = this.host.bean(id);
    if (!bean) return { id, kind: 'skipped', reason: 'unknown-bean' };
    if (alreadySet(bean, edit)) return { id, kind: 'unchanged' };
    const result = await this.host.mutate(id, changeOf(edit), basis);
    if (result.kind === 'saved') return { id, kind: 'saved' };
    if (result.kind === 'ignored') return { id, kind: 'skipped', reason: result.reason };
    const { error } = result;
    return error.kind === 'conflict' ? { id, kind: 'conflict', error } : error.kind === 'uncertain' ? { id, kind: 'uncertain', error, checked: false } : { id, kind: 'failed', error };
  }
}
