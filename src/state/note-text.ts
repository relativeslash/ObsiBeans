/**
 * Text rules for writing into a note the user may keep editing. Pure: the shell owns the editor.
 * A selection is remembered with the text around it, so a later write can prove it still has the right place.
 */

/** Characters of context kept on each side. Enough to tell repeated lines apart; short enough to survive nearby typing. */
const RADIUS = 40;
/** Longest title taken from a selection. */
const TITLE_LIMIT = 80;

/** What the note looked like around the selection when the command ran. */
export interface Anchor {
  /** Offset of the selection start. */
  readonly offset: number;
  readonly before: string;
  readonly text: string;
  readonly after: string;
}

export function anchorAt(doc: string, from: number, to: number): Anchor {
  return { offset: from, before: doc.slice(Math.max(0, from - RADIUS), from), text: doc.slice(from, to), after: doc.slice(to, to + RADIUS) };
}

/**
 * Where the anchored selection starts now, or undefined when it cannot be told: the text around it changed,
 * or the same context appears more than once. Never guesses between candidates.
 */
export function locate(doc: string, anchor: Anchor): number | undefined {
  const context = anchor.before + anchor.text + anchor.after;
  const start = anchor.offset - anchor.before.length;
  if (doc.startsWith(context, start)) return anchor.offset;
  const found = doc.indexOf(context);
  return found !== -1 && found === doc.lastIndexOf(context) ? found + anchor.before.length : undefined;
}

/** What to write after a selection: a space first unless the selection is empty or already ends in whitespace. */
export const afterSelection = (selection: string, link: string): string => (selection === '' || /\s$/.test(selection) ? link : ` ${link}`);

/** Link text must not break out of `[[...|alias]]` or `[alias](...)`. */
export const plainAlias = (title: string): string => title.replace(/[[\]|#^\\]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * A one-line title from the first non-empty line of a selection: list, heading, quote and task markers and
 * link brackets are dropped, so the title reads as text and carries no Markdown of its own.
 */
export function titleFrom(selection: string): string {
  const line = selection.split('\n').find((one) => one.trim() !== '') ?? '';
  const plain = line
    .replace(/^\s*(?:(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?|#{1,6}\s+|>\s*)+/, '')
    .replace(/!?\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > TITLE_LIMIT ? `${plain.slice(0, TITLE_LIMIT - 1).trimEnd()}…` : plain;
}

/**
 * The bean description for a converted selection: the selected text unchanged, then where it came from.
 * A one-line selection that is exactly the title is not repeated.
 */
export function bodyFrom(selection: string, title: string, sourceLink: string, label: string): string {
  const text = selection.trim();
  return `${text === title ? '' : `${text}\n\n`}${label} ${sourceLink}`;
}
