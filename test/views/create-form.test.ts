import { describe, expect, it } from 'vitest';
import { EMPTY_FORM, isBlank, parseForm, parseTags, serializeForm, toNewBean } from '../../src/views/create-form.ts';

describe('creation form values', () => {
  it('splits tags on spaces and commas and drops empties', () => {
    expect(parseTags(' a,b  c ,, d')).toEqual(['a', 'b', 'c', 'd']);
    expect(parseTags('')).toEqual([]);
  });

  it('is blank until the title, tags or description hold something', () => {
    expect(isBlank(EMPTY_FORM)).toBe(true);
    expect(isBlank({ ...EMPTY_FORM, title: '  ', type: 'epic', expanded: true })).toBe(true);
    for (const patch of [{ title: 'x' }, { tags: 'x' }, { body: 'x' }]) expect(isBlank({ ...EMPTY_FORM, ...patch })).toBe(false);
  });

  it('round-trips through its stored text', () => {
    const values = { title: 'T', type: 'bug', status: 'draft', priority: 'high', tags: 'a b', body: 'Body', parent: 'FX-aaaaa', expanded: true };

    expect(parseForm(serializeForm(values))).toEqual(values);
  });

  it('reads damaged stored text as an empty form, keeping the valid fields', () => {
    expect(parseForm('not json')).toEqual(EMPTY_FORM);
    expect(parseForm('[1]')).toEqual(EMPTY_FORM);
    expect(parseForm('null')).toEqual(EMPTY_FORM);
    expect(parseForm('{"title":"Kept","type":3,"expanded":"yes"}')).toEqual({ ...EMPTY_FORM, title: 'Kept' });
  });

  it('leaves open fields out so the adapter applies the project defaults', () => {
    expect(toNewBean({ ...EMPTY_FORM, title: '  Hello ' }, false)).toEqual({ title: 'Hello' });
  });

  it('sends every chosen field, and the description only when it has text', () => {
    const values = { title: 'T', type: 'bug', status: 'in-progress', priority: 'high', tags: 'a, b', body: 'Text', parent: 'FX-aaaaa', expanded: true };

    expect(toNewBean(values, false)).toEqual({ title: 'T', type: 'bug', status: 'in-progress', priority: 'high', tags: ['a', 'b'], body: 'Text', parentId: 'FX-aaaaa' });
    expect(toNewBean({ ...values, body: ' \n' }, false)).not.toHaveProperty('body');
  });

  it('always asks for a draft when creating a draft, whatever the status field says', () => {
    expect(toNewBean({ ...EMPTY_FORM, title: 'T', status: 'in-progress' }, true)).toEqual({ title: 'T', status: 'draft' });
  });
});
