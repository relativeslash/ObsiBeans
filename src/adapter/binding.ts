import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { ProcessResult, ProcessRunner } from './process.ts';

/** The audited release this adapter is written for. See the Beans 0.4.2 contract note. */
export const SUPPORTED_BEANS_VERSION = '0.4.2';
/** What a `go install` or source build of Beans calls itself. Accepted, but its behavior is not audited. */
export const DEV_BEANS_VERSION = 'dev';
export const DEFAULT_CONFIG = '.beans.yml';
export const PROBE_TIMEOUT_MS = 5_000;
export const BEANS_TIMEOUT_MS = 30_000;
export const BEANS_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_CONFIG_BYTES = 64 * 1024;
/** Beans' own defaults when the keys are absent (observed on 0.4.2). */
const DEFAULT_PREFIX = '';
const DEFAULT_ID_LENGTH = 4;
const MAX_ID_LENGTH = 64;

/** Why no usable project is bound. Fields hold only strings and numbers, so views can format them directly. */
export type BindingDiagnostic =
  | { readonly code: 'vault-not-local' }
  | { readonly code: 'executable-not-set' }
  | { readonly code: 'executable-not-absolute'; readonly path: string }
  | { readonly code: 'executable-missing'; readonly path: string }
  | { readonly code: 'executable-not-file'; readonly path: string }
  | { readonly code: 'executable-permission'; readonly path: string }
  | { readonly code: 'executable-in-vault'; readonly path: string }
  | { readonly code: 'executable-untrusted'; readonly path: string }
  | { readonly code: 'executable-changed'; readonly path: string }
  | { readonly code: 'executable-failed'; readonly reason: string; readonly detail: string }
  | { readonly code: 'executable-unsupported-version'; readonly found: string; readonly supported: string }
  | { readonly code: 'config-missing'; readonly path: string }
  | { readonly code: 'config-outside-vault'; readonly path: string }
  | { readonly code: 'config-invalid'; readonly path: string; readonly detail: string }
  | { readonly code: 'task-root-missing'; readonly path: string }
  | { readonly code: 'task-root-not-directory'; readonly path: string }
  | { readonly code: 'task-root-outside-vault'; readonly path: string }
  | { readonly code: 'binding-failed'; readonly detail: string };

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly diagnostic: BindingDiagnostic };

/** A verified project. Every path is absolute and symlink-resolved, and the task root lies inside the vault. */
export interface Binding {
  readonly executable: string;
  readonly configPath: string;
  /** The config's directory: the working directory of every Beans call. */
  readonly projectDir: string;
  readonly taskRoot: string;
  readonly prefix: string;
  readonly idLength: number;
  readonly version: string;
  /** True only for the audited release. A dev build binds, but only the contract's fallbacks are known to hold. */
  readonly verified: boolean;
}

/** What the user confirmed: the executable's real path and a digest of its content at that moment. */
export interface ExecutableTrust {
  readonly path: string;
  readonly sha256: string;
}

export interface BindingRequest {
  readonly vaultRoot: string;
  /** The executable the user entered. */
  readonly executable: string;
  /** Real path of the executable the user explicitly confirmed. Empty when none was. */
  readonly confirmedExecutable: string;
  /** Digest of that executable's content when it was confirmed. */
  readonly confirmedDigest: string;
  /** Vault-relative config path; empty selects `.beans.yml` in the vault root. */
  readonly config: string;
  readonly parseYaml: (text: string) => unknown;
  readonly runner: ProcessRunner;
}

const fail = (diagnostic: BindingDiagnostic): { ok: false; diagnostic: BindingDiagnostic } => ({ ok: false, diagnostic });

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error ? String(error.code) : undefined;
}

function isInside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

/** Environment for Beans: the caller's own, minus the variable that silently redirects the task root. */
export function beansEnvironment(base: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return Object.fromEntries(
    Object.entries(base).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[0].toUpperCase() !== 'BEANS_PATH'),
  );
}

/**
 * Checks that a user-entered executable is an executable file and returns its real path.
 * An executable inside the vault is refused: vault content is synced and cloned, and it must never decide what runs.
 */
async function inspectExecutable(path: string, vaultRoot: string): Promise<Result<string>> {
  if (path === '') return fail({ code: 'executable-not-set' });
  if (!isAbsolute(path)) return fail({ code: 'executable-not-absolute', path });
  let real;
  try {
    real = await realpath(path);
  } catch (error) {
    return fail({ code: errorCode(error) === 'EACCES' ? 'executable-permission' : 'executable-missing', path });
  }
  if (!(await stat(real)).isFile()) return fail({ code: 'executable-not-file', path });
  if (isInside(await realpath(vaultRoot), real)) return fail({ code: 'executable-in-vault', path });
  try {
    await access(real, constants.X_OK);
  } catch {
    return fail({ code: 'executable-permission', path });
  }
  return { ok: true, value: real };
}

interface ProjectConfig {
  readonly configPath: string;
  readonly taskRoot: string;
  readonly prefix: string;
  readonly idLength: number;
}

async function readProjectConfig(vaultRoot: string, config: string, parseYaml: (text: string) => unknown): Promise<Result<ProjectConfig>> {
  const shown = config === '' ? DEFAULT_CONFIG : config;
  const invalid = (detail: string): Result<never> => fail({ code: 'config-invalid', path: shown, detail });
  const vault = await realpath(vaultRoot);

  let configPath;
  try {
    configPath = await realpath(resolve(vault, shown));
  } catch {
    return fail({ code: 'config-missing', path: shown });
  }
  if (!isInside(vault, configPath)) return fail({ code: 'config-outside-vault', path: shown });
  const info = await stat(configPath);
  if (!info.isFile()) return invalid('not a file');
  if (info.size > MAX_CONFIG_BYTES) return invalid('file is too large');

  let root: unknown;
  try {
    root = parseYaml(await readFile(configPath, 'utf8'));
  } catch (error) {
    return invalid(error instanceof Error ? error.message : 'not valid YAML');
  }
  const beans = typeof root === 'object' && root !== null && 'beans' in root ? root.beans : undefined;
  if (typeof beans !== 'object' || beans === null) return invalid('missing the beans section');
  const { path, prefix = DEFAULT_PREFIX, id_length: idLength = DEFAULT_ID_LENGTH } = beans as Record<string, unknown>;
  if (typeof path !== 'string' || path === '') return invalid('beans.path must be a non-empty string');
  if (typeof prefix !== 'string') return invalid('beans.prefix must be a string');
  if (typeof idLength !== 'number' || !Number.isInteger(idLength) || idLength < 1 || idLength > MAX_ID_LENGTH) {
    return invalid(`beans.id_length must be a whole number from 1 to ${String(MAX_ID_LENGTH)}`);
  }

  let taskRoot;
  try {
    taskRoot = await realpath(resolve(dirname(configPath), path));
  } catch {
    return fail({ code: 'task-root-missing', path });
  }
  if (!isInside(vault, taskRoot)) return fail({ code: 'task-root-outside-vault', path });
  if (!(await stat(taskRoot)).isDirectory()) return fail({ code: 'task-root-not-directory', path });
  return { ok: true, value: { configPath, taskRoot, prefix, idLength } };
}

function describeFailure(result: ProcessResult, path: string): BindingDiagnostic {
  switch (result.kind) {
    case 'spawn-failed':
      return result.reason === 'permission-denied'
        ? { code: 'executable-permission', path }
        : { code: 'executable-failed', reason: 'spawn', detail: result.message };
    case 'exited':
      return { code: 'executable-failed', reason: 'exit', detail: `exit code ${String(result.code)}` };
    default:
      return { code: 'executable-failed', reason: result.kind, detail: '' };
  }
}

async function probeVersion(runner: ProcessRunner, executable: string, cwd: string): Promise<Result<string>> {
  const result = await runner.run({
    executable,
    args: ['version'],
    cwd,
    env: beansEnvironment(),
    timeoutMs: PROBE_TIMEOUT_MS,
    maxOutputBytes: 4096,
  });
  if (result.kind !== 'exited' || result.code !== 0) return fail(describeFailure(result, executable));
  const line = result.stdout.split('\n', 1)[0]?.trim() ?? '';
  const version = /^beans (\S+)/.exec(line)?.[1];
  return version === SUPPORTED_BEANS_VERSION || version === DEV_BEANS_VERSION
    ? { ok: true, value: version }
    : fail({ code: 'executable-unsupported-version', found: line.slice(0, 80), supported: SUPPORTED_BEANS_VERSION });
}

/**
 * Binds the one project of a vault. The executable is run only after every static check passed and the user
 * confirmed that exact file. Nothing here modifies the project or the vault.
 */
export function bindProject(request: BindingRequest): Promise<Result<Binding>> {
  return guarded(() => bind(request));
}

/** The user's explicit trust step: validates the entered executable and returns what to remember about it. */
export function confirmExecutable(path: string, vaultRoot: string): Promise<Result<ExecutableTrust>> {
  return guarded(async () => {
    const inspected = await inspectExecutable(path, vaultRoot);
    return inspected.ok ? { ok: true, value: { path: inspected.value, sha256: await digestOf(inspected.value) } } : inspected;
  });
}

async function digestOf(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** A file system race or an unexpected platform error must surface as a diagnostic, not a rejection. */
async function guarded<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch (error) {
    return fail({ code: 'binding-failed', detail: error instanceof Error ? error.message : String(error) });
  }
}

async function bind(request: BindingRequest): Promise<Result<Binding>> {
  const { vaultRoot, executable, confirmedExecutable, confirmedDigest, config, parseYaml, runner } = request;
  const inspected = await inspectExecutable(executable, vaultRoot);
  if (!inspected.ok) return inspected;
  if (inspected.value !== confirmedExecutable) return fail({ code: 'executable-untrusted', path: inspected.value });
  // ponytail: a file swapped between this check and the spawn is still run; pin by file descriptor if that matters.
  if ((await digestOf(inspected.value)) !== confirmedDigest) return fail({ code: 'executable-changed', path: inspected.value });

  const project = await readProjectConfig(vaultRoot, config, parseYaml);
  if (!project.ok) return project;
  const { configPath, taskRoot, prefix, idLength } = project.value;
  const projectDir = dirname(configPath);

  const version = await probeVersion(runner, inspected.value, projectDir);
  if (!version.ok) return version;
  return { ok: true, value: { executable: inspected.value, configPath, projectDir, taskRoot, prefix, idLength, version: version.value, verified: version.value === SUPPORTED_BEANS_VERSION } };
}

/**
 * Runs one Beans command against the bound project: explicit `--config`, the project directory as working
 * directory, no `BEANS_PATH`, and `--json` immediately after the command name.
 */
export function runBeans(
  runner: ProcessRunner,
  binding: Binding,
  command: string,
  args: readonly string[] = [],
  options: { readonly signal?: AbortSignal; readonly timeoutMs?: number } = {},
): Promise<ProcessResult> {
  return runner.run({
    executable: binding.executable,
    args: ['--config', binding.configPath, command, '--json', ...args],
    cwd: binding.projectDir,
    env: beansEnvironment(),
    timeoutMs: options.timeoutMs ?? BEANS_TIMEOUT_MS,
    maxOutputBytes: BEANS_MAX_OUTPUT_BYTES,
    ...(options.signal && { signal: options.signal }),
  });
}
