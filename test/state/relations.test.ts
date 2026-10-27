import { describe, expect, it } from 'vitest';
import { additionOf, ancestry, canHaveChildren, descendantIds, eligibleParents, inBlockingCycle, localProblem, removalPlan, typeBlockers } from '../../src/state/relations.ts';
import { A, B, C, VOCABULARY, bean, loaded } from './support.ts';

const D = 'FX-ddddd';
const TYPES = VOCABULARY.types;

describe('hierarchy', () => {
  const tree = [
    bean(A, { type: 'milestone' }),
    bean(B, { type: 'epic', parentId: A }),
    bean(C, { type: 'feature', parentId: B }),
    bean(D, { type: 'task', parentId: C }),
  ];

  it('lists ancestors root first and reports a missing parent or a loop instead of hanging', () => {
    expect(ancestry(tree, D).chain.map((one) => one.id)).toEqual([A, B, C]);
    expect(ancestry(tree, A)).toEqual({ chain: [], loop: false, missingId: undefined });
    expect(ancestry([bean(A, { parentId: 'FX-zzzzz' })], A)).toMatchObject({ chain: [], missingId: 'FX-zzzzz' });
    expect(ancestry([bean(A, { parentId: B }), bean(B, { parentId: A })], A)).toMatchObject({ loop: true, missingId: undefined });
  });

  it('finds every descendant even when the stored data loops', () => {
    expect([...descendantIds(tree, B)].sort()).toEqual([C, D]);
    expect([...descendantIds([bean(A, { parentId: B }), bean(B, { parentId: A })], A)].sort()).toEqual([A, B]);
  });

  it('offers parents of an allowed type outside the own subtree, by type then title, and none for a milestone', () => {
    const more = [...tree, bean('FX-eeeee', { type: 'epic', title: 'Another epic' })];

    expect(eligibleParents(more, more[3] ?? bean(D), TYPES)).toEqual({ kind: 'options', beans: [more[0], more[4], more[1], more[2]] });
    expect(eligibleParents(more, more[2] ?? bean(C), TYPES)).toEqual({ kind: 'options', beans: [more[0], more[4], more[1]] });
    expect(eligibleParents(more, more[0] ?? bean(A), TYPES)).toEqual({ kind: 'none-possible' });
  });

  it('blocks a type change that would break the parent or a child, with the reason', () => {
    const blocked = typeBlockers(tree, tree[2] ?? bean(C), TYPES);

    expect([...blocked.keys()].sort()).toEqual(['bug', 'epic', 'milestone', 'task']);
    expect(blocked.get('milestone')).toContain(B);
    expect(typeBlockers(tree, tree[1] ?? bean(B), TYPES).get('task')).toContain(`${C} is a feature`);
    expect(typeBlockers([bean(A, { type: 'task' })], bean(A, { type: 'task' }), TYPES).size).toBe(0);
  });

  it('knows which types can have children', () => {
    expect(['milestone', 'epic', 'feature'].map(canHaveChildren)).toEqual([true, true, true]);
    expect(['task', 'bug'].map(canHaveChildren)).toEqual([false, false]);
  });
});

describe('blocking links', () => {
  // A blocks B (stored on A); C is blocked by B (stored on C): A -> B -> C.
  const chain = [bean(A, { blockingIds: [B] }), bean(B), bean(C, { blockedByIds: [B] })];

  it('rejects an edge that closes a loop through both storage directions, in either field', () => {
    expect(localProblem(chain, C, { kind: 'blocking', field: 'blocking', action: 'add', targetId: A }, TYPES)).toContain(`${C} would block ${A}`);
    expect(localProblem(chain, A, { kind: 'blocking', field: 'blocked-by', action: 'add', targetId: C }, TYPES)).toContain(`${C} would block ${A}`);
    expect(localProblem(chain, A, { kind: 'blocking', field: 'blocking', action: 'add', targetId: C }, TYPES)).toBeUndefined();
    expect(localProblem(chain, C, { kind: 'blocking', field: 'blocked-by', action: 'add', targetId: A }, TYPES)).toBeUndefined();
    expect(localProblem(chain, A, { kind: 'blocking', field: 'blocking', action: 'remove', targetId: B }, TYPES)).toBeUndefined();
  });

  it('detects a loop already in the data and terminates', () => {
    const loop = [bean(A, { blockingIds: [B] }), bean(B, { blockedByIds: [C] }), bean(C, { blockedByIds: [A] })];

    expect(inBlockingCycle(loop, A)).toBe(false);
    expect(inBlockingCycle([bean(A, { blockingIds: [B] }), bean(B, { blockingIds: [A] })], A)).toBe(true);
    expect(inBlockingCycle([bean(A, { blockingIds: [B] }), bean(B, { blockedByIds: [A] })], A)).toBe(false);
    expect(inBlockingCycle([bean(A, { blockingIds: [B] }), bean(B, { blockedByIds: [B] }), bean(C, { blockingIds: [A] })], A)).toBe(false);
  });

  it('removes a link through the field that stores it, in both files when both store it', () => {
    expect(removalPlan(chain, A, 'blocks', B)).toEqual([{ id: A, change: { kind: 'blocking', field: 'blocking', action: 'remove', targetId: B } }]);
    expect(removalPlan(chain, B, 'blockedBy', A)).toEqual([{ id: A, change: { kind: 'blocking', field: 'blocking', action: 'remove', targetId: B } }]);
    expect(removalPlan(chain, B, 'blocks', C)).toEqual([{ id: C, change: { kind: 'blocking', field: 'blocked-by', action: 'remove', targetId: B } }]);
    expect(removalPlan(chain, C, 'blockedBy', B)).toEqual([{ id: C, change: { kind: 'blocking', field: 'blocked-by', action: 'remove', targetId: B } }]);
    const both = [bean(A, { blockingIds: [B] }), bean(B, { blockedByIds: [A] })];
    expect(removalPlan(both, A, 'blocks', B).map((step) => step.id)).toEqual([A, B]);
    expect(removalPlan([bean(A, { blockedByIds: ['FX-zzzzz'] })], A, 'blockedBy', 'FX-zzzzz')).toEqual([{ id: A, change: { kind: 'blocking', field: 'blocked-by', action: 'remove', targetId: 'FX-zzzzz' } }]);
    expect(removalPlan(chain, A, 'blocks', C)).toEqual([]);
  });

  it('adds a link in the field of the bean being edited', () => {
    expect(additionOf('blocks', B)).toEqual({ kind: 'blocking', field: 'blocking', action: 'add', targetId: B });
    expect(additionOf('blockedBy', B)).toEqual({ kind: 'blocking', field: 'blocked-by', action: 'add', targetId: B });
  });
});

describe('shared state checks', () => {
  it('rejects a type change that breaks the hierarchy and a mixed-direction loop without calling Beans', async () => {
    const { state, port } = await loaded([bean(A, { type: 'epic' }), bean(B, { type: 'task', parentId: A, blockingIds: [C] }), bean(C, { blockedByIds: [] })]);

    const type = await state.mutate(B, { kind: 'fields', type: 'epic' });
    const loop = await state.mutate(B, { kind: 'blocking', field: 'blocked-by', action: 'add', targetId: C });

    expect(type).toMatchObject({ kind: 'failed', error: { kind: 'validation', code: 'input' } });
    expect(loop).toMatchObject({ kind: 'failed', error: { kind: 'validation' } });
    expect(port.mutations).toHaveLength(0);
    expect(state.getSnapshot().saves.get(B)).toMatchObject({ kind: 'failed' });
  });

  it('lets a valid type change through to Beans', async () => {
    const { state, port } = await loaded([bean(A, { type: 'epic' }), bean(B, { type: 'task', parentId: A })]);

    void state.mutate(B, { kind: 'fields', type: 'bug' });

    expect(port.mutations).toHaveLength(1);
  });
});
