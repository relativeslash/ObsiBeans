import type { NewBean } from '../state/model.ts';

/** The creation form, edited in place by its fields. An empty `type`, `status` or `priority` means "the project default", which Beans' own API does not apply. */
export interface FormValues {
  title: string;
  type: string;
  status: string;
  priority: string;
  /** As typed: words separated by spaces or commas. */
  tags: string;
  body: string;
  expanded: boolean;
}

export const EMPTY_FORM: FormValues = { title: '', type: '', status: '', priority: '', tags: '', body: '', expanded: false };

/** The local key of the one creation form: its draft and save state are stored under it. */
export const FORM_KEY = 'form';

export const parseTags = (text: string): string[] => text.split(/[\s,]+/).filter((tag) => tag !== '');

/** Nothing worth recovering. */
export const isBlank = (values: FormValues): boolean => values.title.trim() === '' && values.body.trim() === '' && values.tags.trim() === '';

export const serializeForm = (values: FormValues): string => JSON.stringify(values);

/** Reads a stored form; anything that is not a field of the right type falls back to the empty value. */
export function parseForm(text: string): FormValues {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) stored = parsed as Record<string, unknown>;
  } catch {
    // A damaged draft yields an empty form; the text itself stays in plugin storage until discarded.
  }
  const field = (key: Exclude<keyof FormValues, 'expanded'>): string => (typeof stored[key] === 'string' ? stored[key] : EMPTY_FORM[key]);
  return {
    title: field('title'),
    type: field('type'),
    status: field('status'),
    priority: field('priority'),
    tags: field('tags'),
    body: field('body'),
    expanded: stored.expanded === true,
  };
}

/** "Create draft" always asks for `draft`, as the TUI's capture flow does, whatever the form's status says. */
export function toNewBean(values: FormValues, draft: boolean): NewBean {
  const tags = parseTags(values.tags);
  return {
    title: values.title.trim(),
    ...(values.type !== '' && { type: values.type }),
    ...(draft ? { status: 'draft' } : values.status !== '' && { status: values.status }),
    ...(values.priority !== '' && { priority: values.priority }),
    ...(tags.length > 0 && { tags }),
    ...(values.body.trim() !== '' && { body: values.body }),
  };
}
