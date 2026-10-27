import { describe, expect, it } from 'vitest';
import { afterSelection, anchorAt, bodyFrom, locate, plainAlias, titleFrom } from '../../src/state/note-text.ts';

const DOC = 'Intro line\n\nBuy milk and eggs\n\nOutro line';
const WORD = 'milk and eggs';
const START = DOC.indexOf(WORD);

describe('locate', () => {
  it('finds the selection where it was', () => {
    expect(locate(DOC, anchorAt(DOC, START, START + WORD.length))).toBe(START);
  });

  it('follows the selection when text above it changed', () => {
    const anchor = anchorAt(DOC, START, START + WORD.length);
    const typed = `Added line\n${DOC}`;
    expect(locate(typed, anchor)).toBe(START + 'Added line\n'.length);
  });

  it('refuses when the selected text or its surroundings were edited', () => {
    const anchor = anchorAt(DOC, START, START + WORD.length);
    expect(locate(DOC.replace('milk', 'oat'), anchor)).toBeUndefined();
    expect(locate(DOC.replace('Buy ', 'Buy more '), anchor)).toBeUndefined();
    expect(locate('', anchor)).toBeUndefined();
  });

  it('never guesses between two identical places', () => {
    const twice = `${DOC}\n${DOC}`;
    const anchor = anchorAt(DOC, START, START + WORD.length);
    // Moved text with the same context twice in the note: ambiguous, so no position.
    expect(locate(`x${twice}`, anchor)).toBeUndefined();
  });

  it('anchors a bare cursor with the text around it', () => {
    const anchor = anchorAt(DOC, START, START);
    expect(anchor.text).toBe('');
    expect(locate(DOC, anchor)).toBe(START);
    expect(locate(DOC.replace('Buy', 'Sell'), anchor)).toBeUndefined();
  });
});

describe('afterSelection', () => {
  it('separates the link from the text, but not from nothing or whitespace', () => {
    expect(afterSelection('milk', '[[B]]')).toBe(' [[B]]');
    expect(afterSelection('', '[[B]]')).toBe('[[B]]');
    expect(afterSelection('milk\n', '[[B]]')).toBe('[[B]]');
  });
});

describe('titleFrom', () => {
  it('takes the first non-empty line without list, heading, quote or task markers', () => {
    expect(titleFrom('\n  - [ ] Call the bank\nmore')).toBe('Call the bank');
    expect(titleFrom('## Plan\nbody')).toBe('Plan');
    expect(titleFrom('> 1. quoted')).toBe('quoted');
  });

  it('reduces links to their visible text', () => {
    expect(titleFrom('See [[Note|the note]] and [[Other]] and [site](https://x.test) ![[img.png]]')).toBe('See the note and Other and site img.png');
  });

  it('keeps special characters as plain text and shortens long titles with one character of marker', () => {
    expect(titleFrom('a "quoted" #tag <b>x</b> {{y}} $z')).toBe('a "quoted" #tag <b>x</b> {{y}} $z');
    const long = titleFrom('x'.repeat(200));
    expect(long).toHaveLength(80);
    expect(long.endsWith('…')).toBe(true);
    expect(titleFrom('   \n  ')).toBe('');
  });
});

describe('bodyFrom', () => {
  it('keeps the selection and names the source; a selection equal to the title is not repeated', () => {
    expect(bodyFrom('Line one\nline two', 'Line one', '[[N]]', 'Source:')).toBe('Line one\nline two\n\nSource: [[N]]');
    expect(bodyFrom('  Same  ', 'Same', '[[N]]', 'Source:')).toBe('Source: [[N]]');
  });
});

describe('plainAlias', () => {
  it('removes characters that would end the link text', () => {
    expect(plainAlias('a [b] | c#d ^e \\ f\n g')).toBe('a b c d e f g');
  });
});
