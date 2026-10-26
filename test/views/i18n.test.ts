import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { createTranslator, LOCALE, t } from '../../src/views/i18n.ts';
import { en } from '../../src/views/messages.en.ts';

function translatorWith(messages: Record<string, string>): { format: (key: string, values?: Record<string, number>) => string; problems: string[] } {
  const problems: string[] = [];
  return { format: createTranslator(messages, (problem) => problems.push(problem)), problems };
}

describe('localization', () => {
  it('parses every English message as ICU MessageFormat', () => {
    for (const [key, pattern] of Object.entries(en)) {
      expect(() => new IntlMessageFormat(pattern, LOCALE), key).not.toThrow();
    }
  });

  it('formats catalog messages', () => {
    expect(t('workspace.title')).toBe(en['workspace.title']);
  });

  it('selects English plural categories and formats numbers in the declared locale', () => {
    const { format } = translatorWith({ selected: '{count, plural, one {# bean} other {# beans}} of {total, number}' });

    expect(format('selected', { count: 0, total: 1234 })).toBe('0 beans of 1,234');
    expect(format('selected', { count: 1, total: 1 })).toBe('1 bean of 1');
    expect(format('selected', { count: 2, total: 2.5 })).toBe('2 beans of 2.5');
  });

  it('returns the key and reports once for missing arguments, malformed patterns and missing messages', () => {
    const { format, problems } = translatorWith({ needsCount: '{count} left', broken: '{count, plural, one {#}' });

    expect(format('needsCount')).toBe('needsCount');
    expect(format('needsCount')).toBe('needsCount');
    expect(format('broken', { count: 1 })).toBe('broken');
    expect(format('absent')).toBe('absent');
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain('"needsCount"');
  });

  it('rejects messages that produce rich content instead of text', () => {
    const { format, problems } = translatorWith({ rich: 'a <b>bold</b> word' });

    expect(format('rich')).toBe('rich');
    expect(problems).toHaveLength(1);
  });
});
