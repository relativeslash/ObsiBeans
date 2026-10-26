import { describe, expect, it } from 'vitest';
import { fnv1a64, unsafeReason } from '../../src/adapter/beans-guard.ts';
import { parseYaml } from '../support/obsidian.ts';

/** Independent reference: the textbook BigInt form of FNV-1a 64. */
function reference(bytes: Uint8Array): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return hash.toString(16).padStart(16, '0');
}

describe('fnv1a64', () => {
  it('matches the published test vectors', () => {
    expect(fnv1a64(new Uint8Array())).toBe('cbf29ce484222325');
    expect(fnv1a64(new TextEncoder().encode('a'))).toBe('af63dc4c8601ec8c');
    expect(fnv1a64(new TextEncoder().encode('foobar'))).toBe('85944171f73967e8');
  });

  it('agrees with the BigInt reference on every byte value and on longer input', () => {
    const everyByte = Uint8Array.from({ length: 256 }, (_, index) => index);
    const long = new TextEncoder().encode('---\n# FX-abcde\ntitle: Ünïcode ✓\n---\n\n'.repeat(500));

    expect(fnv1a64(everyByte)).toBe(reference(everyByte));
    expect(fnv1a64(long)).toBe(reference(long));
  });
});

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const FILE = '---\n# FX-abcde\ntitle: Hello\nstatus: todo\ntype: task\npriority: normal\ntags:\n    - v1\ncreated_at: 2026-10-26T20:29:44Z\nupdated_at: 2026-10-26T20:29:44Z\n---\n\nBody # not a comment\n';
const check = (text: string, id = 'FX-abcde'): string | undefined => unsafeReason(bytes(text), id, parseYaml);

describe('unsafeReason', () => {
  it('accepts what Beans itself writes, in any key order, with CRLF and with defaults missing', () => {
    expect(check(FILE)).toBeUndefined();
    expect(check(FILE.replaceAll('\n', '\r\n'))).toBeUndefined();
    expect(check('---\nstatus: draft\ntitle: Minimal\n---\n')).toBeUndefined();
    expect(check('---\nstatus: todo\n# FX-abcde\n---\n')).toBeUndefined();
  });

  it('accepts a # inside quotes or a plain word, because Beans keeps those', () => {
    expect(check('---\nstatus: todo\ntitle: "a # b"\n---\n')).toBeUndefined();
    expect(check("---\nstatus: todo\ntitle: 'a # b'\n---\n")).toBeUndefined();
    expect(check('---\nstatus: todo\ntitle: "esc \\" # still quoted"\n---\n')).toBeUndefined();
    expect(check('---\nstatus: todo\ntitle: issue#12\n---\n')).toBeUndefined();
    expect(check("---\nstatus: todo\ntitle: Don't stop\n---\n")).toBeUndefined();
  });

  it('refuses comments, including after an apostrophe in a plain value', () => {
    expect(check('---\nstatus: todo\n# my note\n---\n')).toContain('# my note');
    expect(check('---\nstatus: todo # why\n---\n')).toContain('# why');
    expect(check("---\nstatus: todo\ntitle: Don't # stop\n---\n")).toContain('# stop');
    expect(check('---\nstatus: todo\n# FX-other\n---\n')).toContain('# FX-other');
    expect(check(`---\nstatus: todo\n# ${'x'.repeat(100)}\n---\n`)).toContain('...');
  });

  it('refuses fields Beans would delete, naming them', () => {
    expect(check('---\nstatus: todo\naliases: x\norder: 3\n---\n')).toBe('The frontmatter has fields that Beans would delete: aliases, order.');
  });

  it('refuses files it cannot judge', () => {
    expect(check('# just a note\n')).toBe('The file has no frontmatter.');
    expect(check('---\nstatus: todo\n')).toBe('The file has no frontmatter.');
    expect(check('\ufeff---\nstatus: todo\n---\n')).toBe('The file has no frontmatter.');
    expect(unsafeReason(Uint8Array.from([0xff, 0xfe, 0x2d]), 'FX-abcde', parseYaml)).toBe('The file is not valid UTF-8.');
    expect(unsafeReason(bytes(FILE), 'FX-abcde', () => { throw new Error('bad yaml'); })).toBe('The frontmatter is not valid YAML: bad yaml');
    expect(unsafeReason(bytes(FILE), 'FX-abcde', () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- JavaScript can throw non-errors (TSE-ERR-003)
      throw 'plain';
    })).toBe('The frontmatter is not valid YAML: plain');
  });

  it('refuses a bean Beans could not place: no status, or an unknown status, type or priority', () => {
    expect(check('---\ntitle: x\n---\n')).toBe('The bean has no valid status.');
    expect(check('---\nstatus: wip\n---\n')).toBe('The bean has no valid status.');
    expect(check('---\nstatus: todo\ntype: story\n---\n')).toBe('The bean has an unknown type.');
    expect(check('---\nstatus: todo\npriority: urgent\n---\n')).toBe('The bean has an unknown priority.');
    expect(unsafeReason(bytes(FILE), 'FX-abcde', () => ['list'])).toBe('The bean has no valid status.');
    expect(unsafeReason(bytes(FILE), 'FX-abcde', () => null)).toBe('The bean has no valid status.');
  });
});
