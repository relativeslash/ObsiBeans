import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS } from '../../src/state/model.ts';
import { applyViewChange, loadViews, SCHEMA_VERSION, serializeViews, unmatchedValues, type SavedView, type ViewContent, type ViewEntry } from '../../src/state/saved-views.ts';
import { VOCABULARY } from './support.ts';

const content: ViewContent = {
  ...DEFAULT_FILTERS,
  types: ['bug'],
  priorities: ['high', 'critical'],
  tags: ['ui'],
  readiness: 'ready',
  representation: 'board',
  sort: { key: 'title', descending: true },
  swimlanes: 'parent',
};
const stored = (id: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id, name, ...content, ...extra });
const view = (entry: ViewEntry | undefined): SavedView => {
  if (entry?.kind !== 'view') throw new Error('not a view');
  return entry.view;
};

describe('loading saved views', () => {
  it('migrates a data file from before saved views to the current version with no views', () => {
    const loaded = loadViews({ executable: '/x', drafts: [] });
    expect(loaded).toEqual({ schemaVersion: SCHEMA_VERSION, entries: [] });
    expect(loadViews(undefined).entries).toEqual([]);
    expect(loadViews('garbage').entries).toEqual([]);
    expect(loadViews({ schemaVersion: -3, savedViews: [stored('a', 'A')] }).entries).toHaveLength(1);
  });

  it('round-trips valid views and keeps their stored order', () => {
    const data = { schemaVersion: SCHEMA_VERSION, savedViews: [stored('b', 'Beta'), stored('a', 'Alpha')] };
    const loaded = loadViews(data);
    expect(loaded.entries.map((entry) => view(entry).name)).toEqual(['Beta', 'Alpha']);
    expect(view(loaded.entries[0])).toEqual({ id: 'b', name: 'Beta', ...content });
    expect(serializeViews(loaded.entries)).toEqual(data.savedViews);
  });

  it('keeps a damaged entry as raw invalid data without blocking its neighbours', () => {
    const bad = [
      [null, 'entry'],
      [stored('', 'x'), 'id'],
      [stored('i', '  '), 'name'],
      [stored('i', 'n', { search: 3 }), 'search'],
      [stored('i', 'n', { statuses: ['todo', 4] }), 'filters'],
      [stored('i', 'n', { readiness: 'later' }), 'readiness'],
      [stored('i', 'n', { representation: 'timeline' }), 'representation'],
      [stored('i', 'n', { sort: { key: 'colour', descending: false } }), 'sort'],
      [stored('i', 'n', { sort: 'title' }), 'sort'],
      [stored('i', 'n', { swimlanes: 'sprint' }), 'swimlanes'],
      [stored('a', 'Other'), 'duplicate'],
      [stored('z', ' alpha '), 'duplicate'],
    ] as const;
    const loaded = loadViews({ schemaVersion: 1, savedViews: [stored('a', 'Alpha'), ...bad.map(([raw]) => raw), stored('k', 'Kept')] });

    expect(loaded.entries.map((entry) => (entry.kind === 'view' ? entry.view.name : entry.reason))).toEqual(['Alpha', ...bad.map(([, reason]) => reason), 'Kept']);
    expect(serializeViews(loaded.entries)).toEqual([stored('a', 'Alpha'), ...bad.map(([raw]) => raw), stored('k', 'Kept')]);
  });

  it('keeps a damaged list as one invalid entry', () => {
    const loaded = loadViews({ schemaVersion: 1, savedViews: { oops: true } });
    expect(loaded.entries).toEqual([{ kind: 'invalid', raw: { oops: true }, reason: 'list' }]);
  });

  it('keeps views of a newer plugin version unread and keeps that version', () => {
    const raw = [stored('a', 'Alpha'), { future: true }];
    const loaded = loadViews({ schemaVersion: SCHEMA_VERSION + 1, savedViews: raw });
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION + 1);
    expect(loaded.entries.every((entry) => entry.kind === 'invalid' && entry.reason === 'newer')).toBe(true);
    expect(serializeViews(loaded.entries)).toEqual(raw);
  });

  it('keeps stored filter values the project no longer knows and reports them', () => {
    const entry = loadViews({ savedViews: [stored('a', 'Old', { statuses: ['archived', 'todo'], tags: ['gone', 'ui'], types: ['bug', 'saga'] })] }).entries[0];
    const old = view(entry);

    expect(old.statuses).toEqual(['archived', 'todo']);
    expect(unmatchedValues(old, VOCABULARY, new Set(['ui']))).toEqual(['status:archived', 'type:saga', 'tag:gone']);
    expect(unmatchedValues(old, VOCABULARY, undefined)).toEqual(['status:archived', 'type:saga']);
  });
});

describe('changing saved views', () => {
  const saved = (): ViewEntry[] => [...loadViews({ savedViews: [stored('a', 'Alpha'), stored('b', 'Beta')] }).entries];

  it('saves a new view with the given content and a trimmed name', () => {
    const result = applyViewChange(saved(), { kind: 'save', name: '  Urgent bugs ', content }, 'n');
    expect(result.ok && result.id).toBe('n');
    expect(result.ok && view(result.entries[2])).toEqual({ id: 'n', name: 'Urgent bugs', ...content });
  });

  it('refuses an empty or taken name, ignoring case, without changing anything', () => {
    const entries = saved();
    expect(applyViewChange(entries, { kind: 'save', name: ' ', content }, 'n')).toEqual({ ok: false, reason: 'name-empty' });
    expect(applyViewChange(entries, { kind: 'save', name: 'ALPHA', content }, 'n')).toEqual({ ok: false, reason: 'name-taken' });
    expect(applyViewChange(entries, { kind: 'rename', id: 'b', name: 'alpha' }, 'n')).toEqual({ ok: false, reason: 'name-taken' });
    expect(applyViewChange(entries, { kind: 'rename', id: 'b', name: '' }, 'n')).toEqual({ ok: false, reason: 'name-empty' });
  });

  it('renames a view, also to a different case of its own name, and updates its content', () => {
    const renamed = applyViewChange(saved(), { kind: 'rename', id: 'a', name: 'ALPHA' }, 'n');
    expect(renamed.ok && view(renamed.entries[0]).name).toBe('ALPHA');
    const updated = applyViewChange(saved(), { kind: 'update', id: 'b', content: { ...content, search: 'api' } }, 'n');
    expect(updated.ok && view(updated.entries[1])).toEqual({ id: 'b', name: 'Beta', ...content, search: 'api' });
  });

  it('removes any entry, valid or invalid, and refuses a view that is gone', () => {
    const entries = [...saved(), ...loadViews({ savedViews: [null] }).entries];
    const removed = applyViewChange(entries, { kind: 'remove', entry: entries[2] as ViewEntry }, 'n');
    expect(removed.ok && removed.entries).toEqual(entries.slice(0, 2));
    expect(applyViewChange(entries, { kind: 'remove', entry: { kind: 'invalid', raw: 1, reason: 'entry' } }, 'n')).toEqual({ ok: false, reason: 'missing' });
    expect(applyViewChange(entries, { kind: 'rename', id: 'zzz', name: 'x' }, 'n')).toEqual({ ok: false, reason: 'missing' });
    expect(applyViewChange(entries, { kind: 'update', id: 'zzz', content }, 'n')).toEqual({ ok: false, reason: 'missing' });
  });
});
