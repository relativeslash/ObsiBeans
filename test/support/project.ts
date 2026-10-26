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
