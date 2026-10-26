import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A disposable sandbox: a vault whose path contains spaces, plus a sibling folder for executables and other outsiders. */
export interface Sandbox {
  readonly vault: string;
  readonly outside: string;
  dispose(): Promise<void>;
}

export async function makeSandbox(): Promise<Sandbox> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'obsibeans-test-')));
  const vault = join(root, 'my vault');
  const outside = join(root, 'outside');
  await mkdir(vault);
  await mkdir(outside);
  return { vault, outside, dispose: () => rm(root, { recursive: true, force: true }) };
}

/** Beans settings as `beans init` would write them, with a non-default task path that contains a space. */
export const PROJECT_CONFIG = 'beans:\n    path: Task root\n    prefix: FX-\n    id_length: 5\n    default_status: todo\n';

export async function makeProject(vault: string, config = PROJECT_CONFIG): Promise<void> {
  await writeFile(join(vault, '.beans.yml'), config);
  await mkdir(join(vault, 'Task root'), { recursive: true });
}

/**
 * A stand-in for the Beans executable: a Node script that answers `version` with the given line and echoes
 * every other invocation (arguments, working directory, `BEANS_PATH`) as JSON.
 */
export async function writeFakeBeans(directory: string, versionLine = 'beans 0.4.2 (fake) built now', name = 'beans'): Promise<string> {
  const path = join(directory, name);
  await writeFile(path, `#!${process.execPath}
const argv = process.argv.slice(2);
if (argv.includes('version')) { console.log(${JSON.stringify(versionLine)}); process.exit(0); }
console.log(JSON.stringify({ argv, cwd: process.cwd(), beansPath: process.env.BEANS_PATH ?? null }));
`);
  await chmod(path, 0o755);
  return path;
}

/** The settings that record a user's confirmation of the executable at `path`, as they stand right now. */
export async function trust(path: string): Promise<{ confirmedExecutable: string; confirmedDigest: string }> {
  return { confirmedExecutable: await realpath(path), confirmedDigest: createHash('sha256').update(await readFile(path)).digest('hex') };
}

/** One scripted answer of `writeScriptedBeans`. */
export interface Step {
  /** Regular expression the query text must match; a mismatch fails the call loudly instead of answering. */
  readonly when?: string;
  readonly stdout?: unknown;
  readonly stderr?: string;
  readonly code?: number;
  readonly sleepMs?: number;
  /** Files written before answering, to stand in for Beans (or someone else) changing the project. */
  readonly writes?: readonly { readonly file: string; readonly text: string }[];
}

export interface Call {
  readonly query: string;
  readonly variables: Record<string, unknown>;
}

/**
 * A Beans stand-in that answers GraphQL calls from a script, one step per call in order, and records every call.
 * `version` is answered without consuming a step. Steps live next to the executable, outside the vault.
 */
export async function writeScriptedBeans(directory: string): Promise<string> {
  const path = join(directory, 'beans');
  await writeFile(path, `#!${process.execPath}
const fs = require('fs');
const argv = process.argv.slice(2);
if (argv.includes('version')) { console.log('beans 0.4.2 (scripted) built now'); process.exit(0); }
const dir = __dirname;
const steps = JSON.parse(fs.readFileSync(dir + '/steps.json', 'utf8'));
const calls = JSON.parse(fs.readFileSync(dir + '/calls.json', 'utf8'));
const at = argv.indexOf('-v');
const query = argv[argv.length - 1];
calls.push({ query, variables: at >= 0 ? JSON.parse(argv[at + 1]) : {} });
fs.writeFileSync(dir + '/calls.json', JSON.stringify(calls));
const step = steps.shift();
fs.writeFileSync(dir + '/steps.json', JSON.stringify(steps));
if (!step || (step.when && !new RegExp(step.when).test(query))) {
  console.error('Error: unscripted call: ' + query.slice(0, 80));
  process.exit(99);
}
for (const write of step.writes ?? []) fs.writeFileSync(write.file, write.text);
setTimeout(() => {
  if (step.stdout !== undefined) process.stdout.write(typeof step.stdout === 'string' ? step.stdout : JSON.stringify(step.stdout));
  if (step.stderr) process.stderr.write(step.stderr);
  process.exit(step.code ?? 0);
}, step.sleepMs ?? 0);
`);
  await chmod(path, 0o755);
  await script(directory, []);
  return path;
}

/** Replaces the script and clears the recorded calls. */
export async function script(directory: string, steps: readonly Step[]): Promise<void> {
  await writeFile(join(directory, 'steps.json'), JSON.stringify(steps));
  await writeFile(join(directory, 'calls.json'), '[]');
}

export async function callsOf(directory: string): Promise<Call[]> {
  return JSON.parse(await readFile(join(directory, 'calls.json'), 'utf8')) as Call[];
}
