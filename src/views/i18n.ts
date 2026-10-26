import { IntlMessageFormat } from 'intl-messageformat';
import { en } from './messages.en.ts';

/** The only declared locale. The system locale is deliberately ignored so it cannot change behavior. */
export const LOCALE = 'en';

export type MessageKey = keyof typeof en;
export type MessageValues = Readonly<Record<string, string | number>>;
export type Translator<K extends string> = (key: K, values?: MessageValues) => string;

/**
 * Formats catalog messages. A missing or malformed message, or missing arguments, yields the raw key
 * and one diagnostic per key instead of partial text.
 */
export function createTranslator<K extends string>(
  messages: Readonly<Record<K, string>>,
  report: (problem: string) => void = console.warn,
): Translator<K> {
  const formats = new Map<K, IntlMessageFormat>();
  const reported = new Set<K>();
  return (key, values) => {
    try {
      const format = formats.get(key) ?? new IntlMessageFormat(messages[key], LOCALE);
      formats.set(key, format);
      const text = format.format(values);
      if (typeof text !== 'string') throw new Error('message produced non-text content');
      return text;
    } catch (error) {
      if (!reported.has(key)) {
        reported.add(key);
        report(`ObsiBeans cannot format message "${key}": ${error instanceof Error ? error.message : String(error)}`);
      }
      return key;
    }
  };
}

export const t: Translator<MessageKey> = createTranslator(en);
