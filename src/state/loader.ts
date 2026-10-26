import type { Outcome } from '../adapter/beans-model.ts';
import type { ProjectRead } from '../adapter/beans-read.ts';

export interface LoaderOptions {
  /** Reads the project. May reject; that becomes a backend failure. Should stop when the signal aborts. */
  readonly load: (signal: AbortSignal) => Promise<Outcome<ProjectRead>>;
  /** Called only with the result of the newest load. Superseded and disposed loads report nothing. Must not throw. */
  readonly settled: (outcome: Outcome<ProjectRead>) => void;
  readonly busy: (busy: boolean) => void;
  readonly debounceMs: number;
}

/**
 * Owns every project load of one workspace: debouncing, the newest-wins rule, cancellation and the single parse
 * retry. A load that is not the newest is aborted and its answer ignored, so out-of-order answers cannot overwrite
 * newer data. Nothing runs before the first `refresh` or `request`, and nothing runs after `dispose`.
 *
 * ponytail: a burst of requests restarts the debounce each time, so continuous writes postpone the refresh until
 * they pause. Add a maximum wait if a real project writes that continuously.
 */
export class Loader {
  private readonly options: LoaderOptions;
  private generation = 0;
  private controller: AbortController | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(options: LoaderOptions) {
    this.options = options;
  }

  /** Loads now, replacing any load in flight and any scheduled one. */
  refresh(): Promise<void> {
    return this.run(false);
  }

  /** Coalesces a burst of change events into one refresh after the debounce. */
  request(): void {
    this.cancelTimer();
    this.schedule(false);
  }

  /** Makes the running and scheduled loads obsolete, for example because a write just changed the data they would return. */
  supersede(): void {
    this.cancelTimer();
    if (this.controller === undefined) return;
    this.generation++;
    this.controller.abort();
    this.controller = undefined;
    this.options.busy(false);
  }

  dispose(): void {
    this.disposed = true;
    this.supersede();
  }

  private cancelTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(retry: boolean): void {
    if (!this.disposed) this.timer = setTimeout(() => void this.run(retry), this.options.debounceMs);
  }

  private async run(retry: boolean): Promise<void> {
    if (this.disposed) return;
    this.cancelTimer();
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const generation = ++this.generation;
    this.options.busy(true);
    const outcome = await this.attempt(controller.signal);
    if (generation !== this.generation) return;
    this.controller = undefined;
    this.options.busy(false);
    this.options.settled(outcome);
    // A file caught half-written fails to parse. One retry after the debounce, then the failure stands until the next change.
    if (!outcome.ok && !retry && outcome.error.kind === 'backend' && outcome.error.code === 'invalid-data') this.schedule(true);
  }

  private async attempt(signal: AbortSignal): Promise<Outcome<ProjectRead>> {
    try {
      return await this.options.load(signal);
    } catch (error) {
      return { ok: false, error: { kind: 'backend', code: 'failed', message: error instanceof Error ? error.message : String(error) } };
    }
  }
}
