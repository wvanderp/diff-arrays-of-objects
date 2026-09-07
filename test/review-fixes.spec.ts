import { describe, expect, it } from 'vitest';
import diff from '../lib/index.js';
import deep from '../lib/deep-diff/index.js';

describe('collection equality in the public API', () => {
  it.each([
    [new Map([['a', 'b']]), new Map([['b', 'a']])],
    [new Set([[1, 2]]), new Set([[2, 1]])],
    [new Map([['a', [1, 2]]]), new Map([['a', [2, 1]]])],
  ])('reports changed collections instead of classifying them as same', (lhs, rhs) => {
    const before = { id: 1, value: lhs };
    const after = { id: 1, value: rhs };
    expect(diff([before], [after])).toEqual({
      added: [], removed: [], same: [], updated: [after],
    });
    const result = diff([before], [after], 'id', {
      updatedValues: diff.updatedValues.bothWithDeepDiff,
    });
    expect(result.updated).toEqual([[before, after, [
      { kind: 'E', path: ['value'], lhs, rhs },
    ]]]);
  });

  it('matches entries in any insertion order while preserving duplicate counts', () => {
    const before = { id: 1, value: new Map([
      [{ key: 1 }, new Set([[1, 2], [3, 4]])],
      [{ key: 2 }, new Set([[5, 6]])],
    ]) };
    const after = { id: 1, value: new Map([
      [{ key: 2 }, new Set([[5, 6]])],
      [{ key: 1 }, new Set([[3, 4], [1, 2]])],
    ]) };
    expect(diff([before], [after]).same).toEqual([after]);
    expect(deep(before, after)).toBeUndefined();
    expect(deep(new Set([{ x: 1 }, { x: 1 }]), new Set([{ x: 1 }, { x: 2 }])))
      .toBeDefined();
  });

  it('compares cyclic collections without losing their key/value associations', () => {
    const lhs = new Map<unknown, unknown>();
    const rhs = new Map<unknown, unknown>();
    lhs.set('self', lhs);
    rhs.set('self', rhs);
    expect(deep(lhs, rhs)).toBeUndefined();
    expect(diff([{ id: 1, value: lhs }], [{ id: 1, value: rhs }]).same).toHaveLength(1);
    const nested = new Map<unknown, unknown>();
    nested.set('self', nested);
    rhs.set('self', nested);
    expect(deep(lhs, rhs)).toBeDefined();

    const leftSet = new Set<unknown>();
    const rightSet = new Set<unknown>();
    leftSet.add(leftSet);
    rightSet.add(rightSet);
    expect(deep(leftSet, rightSet)).toBeUndefined();
  });
});

describe('root collection patches', () => {
  it.each([
    [new Map([['a', 1], ['deleted', 0]]), new Map([['a', 2], ['new', 3]])],
    [new Set([1, 2]), new Set([2, 3])],
  ])('applies and reverts a root edit, including on the original lhs', (before, after) => {
    const original = structuredClone(before);
    const source = structuredClone(after);
    const changes = deep(before, after)!;
    expect(changes).toHaveLength(1);
    for (const change of changes) deep.applyChange(before, change);
    expect(before).toEqual(after);
    for (const change of changes) deep.revertChange(before, original, change);
    expect(before).toEqual(original);
    deep.applyDiff(before, after);
    expect(before).toEqual(after);
    expect(after).toEqual(source);
    // Reverting directly on the rhs must also preserve the stored change.
    for (const change of changes) deep.revertChange(after, original, change);
    expect(after).toEqual(original);
    for (const change of changes) deep.applyChange(after, change);
    expect(after).toEqual(source);
  });

  it('rejects a root collection type replacement that cannot be performed in place', () => {
    const before = new Map();
    const after = new Set();
    const change = deep(before, after)![0]!;
    expect(() => deep.applyDiff(before, after)).toThrow(/root/i);
    expect(() => deep.revertChange(after, before, change)).toThrow(/root/i);
    expect(before).toEqual(new Map());
    expect(after).toEqual(new Set());
    expect(() => deep.applyDiff({}, before)).toThrow(/root/i);
    expect(() => deep.applyDiff(after, {})).toThrow(/root/i);
  });
});

it('visits changed nested singleton arrays once even when their hashes collide', () => {
  const compareAtDepth = (depth: number): number => {
    let reads = 0;
    let lhs: unknown = { get value () { reads++; return 'Aa'; } };
    let rhs: unknown = { get value () { reads++; return 'BB'; } };
    for (let index = 0; index < depth; index++) { lhs = [lhs]; rhs = [rhs]; }
    expect(deep.orderIndependentDiff(lhs, rhs)).toEqual([
      { kind: 'E', path: [...Array<number>(depth).fill(0), 'value'], lhs: 'Aa', rhs: 'BB' },
    ]);
    return reads;
  };
  expect(compareAtDepth(20)).toBeLessThanOrEqual(compareAtDepth(5) * 4);
});

describe('order-independent filtering and normalization', () => {
  it('aligns records using only fields that participate in comparison', () => {
    expect(deep.orderIndependentDiff(
      [{ id: 1, x: 1 }, { id: 2, x: 2 }],
      [{ id: 2, x: 1 }, { id: 1, x: 2 }],
      (_path, key) => key === 'x',
    )).toBeUndefined();
  });

  it('uses normalized values for matching across different raw hashes', () => {
    expect(deep.orderIndependentDiff(
      [{ name: 'alice' }, { name: 'BOB' }],
      [{ name: 'bob' }, { name: 'ALICE' }],
      { normalize: (_path, key, lhs, rhs) => key === 'name'
        ? [String(lhs).toLowerCase(), String(rhs).toLowerCase()]
        : undefined },
    )).toBeUndefined();
  });

  it('preserves nested paths and does not reuse a matching duplicate', () => {
    const changes = deep.orderIndependentDiff(
      { items: [{ id: 1, ignored: 1 }, { id: 1, ignored: 2 }] },
      { items: [{ id: 2, ignored: 1 }, { id: 1, ignored: 2 }] },
      { prefilter: (path, key) => path[0] === 'items' && key === 'ignored' },
    );
    expect(changes).toEqual([{ kind: 'E', path: ['items', 1, 'id'], lhs: 1, rhs: 2 }]);
  });
});
