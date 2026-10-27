import { describe, expect, it } from 'vitest';
import { bodyText, checklistItems } from '../../src/state/body.ts';

describe('bodyText', () => {
  it('removes the one leading and one trailing newline Beans adds or drops, and nothing else', () => {
    expect(bodyText('\nHello')).toBe('Hello');
    expect(bodyText('\n\nTwo\n\n')).toBe('\nTwo\n');
    expect(bodyText('')).toBe('');
  });
});

describe('checklistItems', () => {
  it('lists every item with the exact line number of the body as read, so repeated texts stay distinct', () => {
    const body = '\nIntro\n- [ ] same\n* [x] other\n  + [X] nested\n- [ ] same\n- plain\n- [x]';

    expect(checklistItems(body)).toEqual([
      { line: 2, text: '- [ ] same', checked: false, label: 'same' },
      { line: 3, text: '* [x] other', checked: true, label: 'other' },
      { line: 4, text: '  + [X] nested', checked: true, label: 'nested' },
      { line: 5, text: '- [ ] same', checked: false, label: 'same' },
      { line: 7, text: '- [x]', checked: true, label: '' },
    ]);
  });

  it('skips examples inside fenced code, closing a fence only with the same kind of fence', () => {
    const body = ['- [ ] before', '```md', '- [ ] example', '~~~', '- [ ] still code', '```', '~~~', '- [x] tilde code', '~~~', '- [ ] after'].join('\n');

    expect(checklistItems(body).map((item) => item.label)).toEqual(['before', 'after']);
  });

  it('is empty without items', () => {
    expect(checklistItems('')).toEqual([]);
  });
});
