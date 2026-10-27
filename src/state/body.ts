/**
 * Beans reads a description with one leading newline and no trailing one (Beans 0.4.2 contract, BC-22), whatever was
 * written. Editors and comparisons use this form, so an untouched description is never reported as changed.
 */
export const bodyText = (body: string): string => body.replace(/^\n/, '').replace(/\n$/, '');

/** One `- [ ]` line of a description. */
export interface ChecklistItem {
  /** 0-based line of the body exactly as read; the adapter targets this line, so repeated texts stay distinct. */
  readonly line: number;
  /** The whole line as read; the adapter refuses the change when the line no longer matches. */
  readonly text: string;
  readonly checked: boolean;
  /** The text after the checkbox, for display. */
  readonly label: string;
}

const ITEM = /^\s*[-*+] \[([ xX])\](.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * The checklist items of a description as read from Beans (do not pass `bodyText`: line numbers must match).
 * Lines inside fenced code are examples, not items.
 */
export function checklistItems(body: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  let fence: string | undefined;
  body.split('\n').forEach((text, line) => {
    const opening = FENCE.exec(text)?.[1];
    if (opening !== undefined && (fence === undefined || (opening[0] === fence[0] && opening.length >= fence.length))) {
      fence = fence === undefined ? opening : undefined;
      return;
    }
    const item = fence === undefined ? ITEM.exec(text) : null;
    if (item) items.push({ line, text, checked: item[1] !== ' ', label: (item[2] ?? '').trim() });
  });
  return items;
}
