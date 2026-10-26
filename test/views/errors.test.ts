import { describe, expect, it } from 'vitest';
import type { AdapterError } from '../../src/state/model.ts';
import { describeError } from '../../src/views/errors.ts';

describe('describeError', () => {
  it('words every failure kind with its detail, never a raw key', () => {
    const errors: AdapterError[] = [
      { kind: 'validation', code: 'input', message: 'bad title' },
      { kind: 'conflict', code: 'revision', current: null },
      { kind: 'preservation', code: 'unsafe-frontmatter', detail: 'extra field' },
      { kind: 'backend', code: 'timeout', message: 'slow' },
      { kind: 'uncertain', message: 'killed', current: null, createdIds: [] },
    ];

    expect(errors.map(describeError)).toEqual([
      'Beans rejected the change: bad title',
      'The bean changed since it was loaded. Review the current version before saving again.',
      'The bean was not changed because Beans would drop data from its file. extra field',
      'Beans failed: slow',
      'The result is unknown. Check the bean before trying again. killed',
    ]);
  });
});
