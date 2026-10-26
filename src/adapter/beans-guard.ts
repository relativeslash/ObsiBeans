import { PRIORITIES, STATUSES, TYPES, isOneOf } from './beans-model.ts';

/** Frontmatter keys Beans writes back. Any other key is dropped by the next update (BC-20). */
export const KNOWN_KEYS: readonly string[] = ['title', 'status', 'type', 'priority', 'tags', 'created_at', 'updated_at', 'parent', 'blocking', 'blocked_by'];

/**
 * FNV-1a 64 as 16 lowercase hex digits, the hash Beans compares `ifMatch` against. Beans hashes the raw file bytes
 * for that comparison. The 64-bit state is two 32-bit halves; the prime is 2^40 + 0x1b3.
 */
export function fnv1a64(bytes: Uint8Array): string {
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  for (const byte of bytes) {
    lo = (lo ^ byte) >>> 0;
    const product = lo * 0x1b3;
    const carry = Math.floor(product / 2 ** 32);
    hi = (hi * 0x1b3 + carry + ((lo << 8) >>> 0)) % 2 ** 32;
    lo = product % 2 ** 32;
  }
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

/**
 * Finds a YAML comment on one frontmatter line: a `#` at the start or after whitespace, outside a quoted scalar.
 * A quote opens only where a value can start, so an apostrophe inside a plain scalar cannot hide a comment.
 * ponytail: a multi-line quoted scalar can make this report a comment that is not one; the bean is then blocked, never damaged.
 */
function commentOf(line: string): string | undefined {
  let quote = '';
  let previous = '';
  for (let i = 0; i < line.length; i++) {
    const char = line.charAt(i);
    if (quote !== '') {
      if (char === '\\' && quote === '"') i++;
      else if (char === quote) quote = '';
    } else if ((char === '"' || char === "'") && (previous === '' || ':-[,{'.includes(previous))) quote = char;
    else if (char === '#' && (i === 0 || /\s/.test(line.charAt(i - 1)))) return line.slice(i);
    if (!/\s/.test(char)) previous = char;
  }
  return undefined;
}

const clip = (text: string): string => (text.length > 60 ? `${text.slice(0, 57)}...` : text);

/**
 * Decides whether Beans can rewrite this file without losing anything: only known keys, no comments but the
 * `# <id>` line Beans writes itself, and a status Beans can place. Missing defaults, key order and CRLF line
 * endings are normalized without loss and pass. Returns the reason to refuse, or undefined when the file is safe.
 */
export function unsafeReason(bytes: Uint8Array, id: string, parseYaml: (text: string) => unknown): string | undefined {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return 'The file is not valid UTF-8.';
  }
  const lines = text.split(/\r?\n/);
  const end = lines.indexOf('---', 1);
  if (lines[0] !== '---' || end < 0) return 'The file has no frontmatter.';
  const front = lines.slice(1, end);

  const comment = front.map(commentOf).find((found, index) => found !== undefined && front[index]?.trim() !== `# ${id}`);
  if (comment !== undefined) return `The frontmatter has a comment (${clip(comment)}) that Beans would delete.`;

  let parsed;
  try {
    parsed = parseYaml(front.join('\n'));
  } catch (error) {
    return `The frontmatter is not valid YAML: ${clip(error instanceof Error ? error.message : String(error))}`;
  }
  const fields = (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {}) as Record<string, unknown>;
  const unknown = Object.keys(fields).filter((key) => !KNOWN_KEYS.includes(key));
  if (unknown.length > 0) return `The frontmatter has fields that Beans would delete: ${clip(unknown.join(', '))}.`;
  if (!isOneOf(STATUSES, fields.status)) return 'The bean has no valid status.';
  if (fields.type !== undefined && !isOneOf(TYPES, fields.type)) return 'The bean has an unknown type.';
  if (fields.priority !== undefined && !isOneOf(PRIORITIES, fields.priority)) return 'The bean has an unknown priority.';
  return undefined;
}
