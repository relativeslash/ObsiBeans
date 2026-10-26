import { spawn } from 'node:child_process';

/** Time a stopped process gets to exit after SIGTERM before it is killed (a Beans write must not be cut short lightly). */
export const KILL_GRACE_MS = 2_000;

export interface ProcessRequest {
  /** Absolute path of the selected executable. Never resolved through a shell or `PATH`. */
  readonly executable: string;
  /** Passed as an argument array; no part of it is ever interpreted by a shell. */
  readonly args: readonly string[];
  readonly cwd: string;
  /** Complete environment of the child. Nothing is inherited implicitly. */
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  /** Limit for stdout and stderr combined. */
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
}

export type SpawnFailure = 'not-found' | 'permission-denied' | 'other';

/** Every outcome is a value; running a process never rejects. */
export type ProcessResult =
  /** `code` is null when a signal ended the process. Any non-zero or null code is a failure. */
  | { readonly kind: 'exited'; readonly code: number | null; readonly stdout: string; readonly stderr: string }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'output-limit' }
  | { readonly kind: 'spawn-failed'; readonly reason: SpawnFailure; readonly message: string };

const SPAWN_FAILURES: Readonly<Record<string, SpawnFailure>> = {
  ENOENT: 'not-found',
  ENOTDIR: 'not-found',
  EACCES: 'permission-denied',
  EPERM: 'permission-denied',
};

/**
 * Runs one process with a deadline, an output limit and cancellation. The result is settled only after the
 * process has exited and its pipes have closed, so a settled run leaves no process behind.
 */
export function runProcess(request: ProcessRequest): Promise<ProcessResult> {
  const { executable, args, cwd, env, timeoutMs, maxOutputBytes, signal } = request;
  if (signal?.aborted) return Promise.resolve({ kind: 'cancelled' });

  return new Promise((resolve) => {
    const child = spawn(executable, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let received = 0;
    let stopped: ProcessResult | undefined;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const stop = (reason: ProcessResult): void => {
      if (stopped) return;
      stopped = reason;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
    };
    const onAbort = (): void => {
      stop({ kind: 'cancelled' });
    };
    const deadline = setTimeout(() => {
      stop({ kind: 'timeout' });
    }, timeoutMs);
    const settle = (result: ProcessResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const collect = (into: Buffer[]) => (chunk: Buffer): void => {
      if (stopped) return;
      received += chunk.length;
      if (received > maxOutputBytes) stop({ kind: 'output-limit' });
      else into.push(chunk);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.on('error', (error: NodeJS.ErrnoException) => {
      // Without a pid the process never started. Later errors (a failed kill) are followed by `close`.
      if (child.pid === undefined) {
        settle({ kind: 'spawn-failed', reason: SPAWN_FAILURES[error.code ?? ''] ?? 'other', message: error.message });
      }
    });
    child.on('close', (code) => {
      settle(stopped ?? { kind: 'exited', code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
    });
  });
}

/**
 * Owns every process a plugin session starts, so project switches and plugin unload can release them all.
 * After `dispose()` nothing starts and every run reports `cancelled`.
 */
export class ProcessRunner {
  private readonly active = new Map<AbortController, Promise<ProcessResult>>();
  private disposed = false;

  run(request: ProcessRequest): Promise<ProcessResult> {
    if (this.disposed) return Promise.resolve({ kind: 'cancelled' });
    const owner = new AbortController();
    const signal = request.signal ? AbortSignal.any([owner.signal, request.signal]) : owner.signal;
    const run = runProcess({ ...request, signal });
    this.active.set(owner, run);
    void run.finally(() => this.active.delete(owner));
    return run;
  }

  /** Cancels every running process, for example when another project is bound. The runner stays usable. */
  cancelAll(): void {
    for (const owner of this.active.keys()) owner.abort();
  }

  /** Cancels everything and refuses further work. Resolves once the cancelled processes have exited. */
  async dispose(): Promise<void> {
    this.disposed = true;
    const runs = [...this.active.values()];
    this.cancelAll();
    await Promise.all(runs);
  }

  get activeCount(): number {
    return this.active.size;
  }
}
