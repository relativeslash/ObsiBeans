import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KILL_GRACE_MS, ProcessRunner, runProcess, type ProcessRequest, type ProcessResult } from '../../src/adapter/process.ts';

let scratch: string;
beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'obsibeans-process-'));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(scratch, { recursive: true, force: true });
});

/** Runs a Node script as the child. `args` follow the script, so scripts read them from `process.argv.slice(1)`. */
function node(script: string, args: string[] = [], extra: Partial<ProcessRequest> = {}): ProcessRequest {
  return {
    executable: process.execPath,
    args: ['-e', script, ...args],
    cwd: scratch,
    env: {},
    timeoutMs: 5_000,
    maxOutputBytes: 1_000_000,
    ...extra,
  };
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** A child that records its pid, then hangs. Optionally ignores SIGTERM. */
const HANG = `require('fs').writeFileSync(process.argv[1], String(process.pid));
if (process.argv[2] === 'stubborn') process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);`;

async function pidOf(file: string): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const text = await readFile(file, 'utf8').catch(() => '');
    if (text) return Number(text);
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error('child never started');
}

describe('runProcess', () => {
  it('passes injection strings as plain arguments, never through a shell', async () => {
    const hostile = ['$(touch pwned)', '; touch pwned', '`touch pwned`', '"quoted" && echo x', '--config=/etc/passwd'];

    const result = await runProcess(node('console.log(JSON.stringify(process.argv.slice(1)))', hostile));

    expect(result).toMatchObject({ kind: 'exited', code: 0 });
    expect(JSON.parse((result as { stdout: string }).stdout)).toEqual(hostile);
    await expect(readFile(join(scratch, 'pwned'))).rejects.toThrow();
  });

  it('runs in the given directory with only the given environment', async () => {
    vi.stubEnv('INHERITED', 'leak');
    const result = await runProcess(node('console.log(process.cwd() + "|" + (process.env.INHERITED ?? "-") + "|" + process.env.GIVEN)', [], { env: { GIVEN: 'yes' } }));

    expect(result).toMatchObject({ kind: 'exited', stdout: `${scratch}|-|yes\n` });
  });

  it('reports a non-zero exit with both streams', async () => {
    const result = await runProcess(node('console.log("out"); console.error("err"); process.exit(3)'));

    expect(result).toEqual({ kind: 'exited', code: 3, stdout: 'out\n', stderr: 'err\n' });
  });

  it('reports a null exit code when a signal ends the process', async () => {
    const result = await runProcess(node('process.kill(process.pid, "SIGKILL")'));

    expect(result).toMatchObject({ kind: 'exited', code: null });
  });

  it('passes malformed output through untouched for the caller to reject', async () => {
    const result = await runProcess(node('process.stdout.write(Buffer.from([0x7b, 0xff, 0xfe]))'));

    expect(result).toMatchObject({ kind: 'exited', code: 0, stdout: '{\uFFFD\uFFFD' });
  });

  it('stops a hung process at the deadline and leaves no process behind', async () => {
    const file = join(scratch, 'pid');
    const run = runProcess(node(HANG, [file], { timeoutMs: 300 }));
    const pid = await pidOf(file);

    expect(await run).toEqual({ kind: 'timeout' });
    expect(alive(pid)).toBe(false);
  });

  it('kills a process that ignores the termination request after the grace period', async () => {
    const file = join(scratch, 'pid');
    const run = runProcess(node(HANG, [file, 'stubborn'], { timeoutMs: 200 }));
    const pid = await pidOf(file);
    const started = Date.now();

    expect(await run).toEqual({ kind: 'timeout' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(KILL_GRACE_MS - 400);
    expect(alive(pid)).toBe(false);
  }, 15_000);

  it('stops a process that exceeds the output limit, counting both streams', async () => {
    const flood = 'for (let i = 0; i < 1000; i++) process.stderr.write("x".repeat(1000)); setInterval(() => {}, 1000)';

    expect(await runProcess(node(flood, [], { maxOutputBytes: 5_000 }))).toEqual({ kind: 'output-limit' });
    expect(await runProcess(node('process.stdout.write("a".repeat(100)); process.stderr.write("b".repeat(100))', [], { maxOutputBytes: 150 }))).toEqual({
      kind: 'output-limit',
    });
  });

  it('accepts output exactly at the limit', async () => {
    const result = await runProcess(node('process.stdout.write("a".repeat(100))', [], { maxOutputBytes: 100 }));

    expect(result).toMatchObject({ kind: 'exited', code: 0 });
  });

  it('cancels a running process and leaves no process behind', async () => {
    const file = join(scratch, 'pid');
    const controller = new AbortController();
    const run = runProcess(node(HANG, [file], { signal: controller.signal }));
    const pid = await pidOf(file);

    controller.abort();

    expect(await run).toEqual({ kind: 'cancelled' });
    expect(alive(pid)).toBe(false);
  });

  it('never starts a process whose signal is already aborted', async () => {
    const file = join(scratch, 'pid');

    expect(await runProcess(node(HANG, [file], { signal: AbortSignal.abort() }))).toEqual({ kind: 'cancelled' });
    await expect(readFile(file)).rejects.toThrow();
  });

  it('keeps the first reason when cancellation and the deadline race', async () => {
    const file = join(scratch, 'pid');
    const controller = new AbortController();
    const run = runProcess(node(HANG, [file], { signal: controller.signal, timeoutMs: 100 }));
    await pidOf(file);
    controller.abort();

    expect(await run).toEqual({ kind: 'cancelled' });
  });

  it('ignores an abort that arrives after the process finished', async () => {
    const controller = new AbortController();
    const result = await runProcess(node('console.log("done")', [], { signal: controller.signal }));
    controller.abort();

    expect(result).toMatchObject({ kind: 'exited', code: 0 });
  });

  it('classifies spawn failures', async () => {
    const missing = await runProcess(node('', [], { executable: join(scratch, 'nope') }));
    const plain = join(scratch, 'plain');
    await writeFile(plain, 'not executable');
    await chmod(plain, 0o644);
    const denied = await runProcess(node('', [], { executable: plain }));
    const badCwd = await runProcess(node('', [], { cwd: join(scratch, 'missing-dir') }));

    expect(missing).toMatchObject({ kind: 'spawn-failed', reason: 'not-found' });
    expect(denied).toMatchObject({ kind: 'spawn-failed', reason: 'permission-denied' });
    expect(badCwd).toMatchObject({ kind: 'spawn-failed', reason: 'not-found' });
  });
});

describe('ProcessRunner', () => {
  it('cancels every running process on cancelAll and stays usable', async () => {
    const runner = new ProcessRunner();
    const files = [join(scratch, 'a'), join(scratch, 'b')];
    const runs = files.map((file) => runner.run(node(HANG, [file])));
    const pids = await Promise.all(files.map(pidOf));
    expect(runner.activeCount).toBe(2);

    runner.cancelAll();

    expect(await Promise.all(runs)).toEqual([{ kind: 'cancelled' }, { kind: 'cancelled' }]);
    expect(pids.some(alive)).toBe(false);
    expect(runner.activeCount).toBe(0);
    expect(await runner.run(node('console.log(1)'))).toMatchObject({ kind: 'exited', code: 0 });
  });

  it('honors a caller signal as well as its own', async () => {
    const runner = new ProcessRunner();
    const file = join(scratch, 'pid');
    const controller = new AbortController();
    const run = runner.run(node(HANG, [file], { signal: controller.signal }));
    await pidOf(file);

    controller.abort();

    expect(await run).toEqual({ kind: 'cancelled' });
  });

  it('releases running processes on dispose and refuses new work', async () => {
    const runner = new ProcessRunner();
    const file = join(scratch, 'pid');
    const run = runner.run(node(HANG, [file]));
    const pid = await pidOf(file);

    await runner.dispose();

    expect(await run).toEqual({ kind: 'cancelled' });
    expect(alive(pid)).toBe(false);
    expect(runner.activeCount).toBe(0);
    const later: ProcessResult = await runner.run(node('require("fs").writeFileSync(process.argv[1], "started")', [join(scratch, 'late')]));
    expect(later).toEqual({ kind: 'cancelled' });
    await expect(readFile(join(scratch, 'late'))).rejects.toThrow();
  });
});
