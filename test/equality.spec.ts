import { expect, it } from 'vitest';
import { isEqual } from '../lib/equality.js';
import diff from '../lib/index.js';

it('compares primitive values and their wrappers', () => {
  const symbol = Symbol('token');
  for (const value of [true, false, 1, NaN, 'text', symbol, BigInt(1)]) {
    expect(isEqual(value, Object(value))).toBe(true);
  }
  for (const [left, right] of [
    [0, -0], [new Date(NaN), new Date(NaN)], [/a/gi, /a/gi],
    [new Error('message'), new Error('message')],
  ]) expect(isEqual(left, right)).toBe(true);
  for (const [left, right] of [
    [null, {}], [undefined, {}], [1, '1'], [1, 2], [true, false], ['a', 'b'],
    [Symbol('a'), Symbol('a')], [BigInt(1), BigInt(2)], [new Date(0), new Date(1)], [/a/g, /a/i],
    [new Error('a'), new Error('b')], [new Error('a'), new TypeError('a')],
    [() => 1, () => 1], [new WeakMap(), new WeakMap()],
  ]) expect(isEqual(left, right)).toBe(false);
});

it('compares ordered arrays, sparse arrays, and binary values', () => {
  expect(isEqual(Array(1), [undefined])).toBe(true);
  expect(isEqual([1], [1, 2])).toBe(false);
  expect(isEqual([1, 2], [2, 1])).toBe(false);
  expect(isEqual(new Float64Array([NaN, -0]), new Float64Array([NaN, 0]))).toBe(true);
  expect(isEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  expect(isEqual(new Uint8Array([1]), new Uint8Array([2]))).toBe(false);
  expect(isEqual(new Uint8Array([1]), new Int8Array([1]))).toBe(false);
  expect(isEqual(new Uint8Array([1]).buffer, new Uint8Array([1]).buffer)).toBe(true);
  expect(isEqual(new Uint8Array([1]).buffer, new Uint8Array([2]).buffer)).toBe(false);
  expect(isEqual(new DataView(new ArrayBuffer(2)), new DataView(new ArrayBuffer(2)))).toBe(true);
  expect(isEqual(new DataView(new ArrayBuffer(2), 0, 1), new DataView(new ArrayBuffer(2), 1, 1))).toBe(false);
  expect(isEqual(new DataView(new ArrayBuffer(2)), new DataView(new ArrayBuffer(2), 0, 1))).toBe(false);
});

it('compares enumerable own keys, symbols, and constructors', () => {
  const symbol = Symbol('key');
  expect(isEqual({ [symbol]: 1 }, { [symbol]: 2 })).toBe(false);
  expect(isEqual({ a: undefined }, { b: undefined })).toBe(false);
  expect(isEqual({}, { a: undefined })).toBe(false);
  expect(isEqual(Object.defineProperty({ a: 1 }, 'hidden', { value: 1 }), { a: 1 })).toBe(true);
  expect(isEqual(Object.create(null), {})).toBe(true);
  expect(isEqual({}, Object.create(null))).toBe(true);
  expect(isEqual({ constructor: 'record' }, { constructor: 'record' })).toBe(true);
  class A { value = 1; }
  class B { value = 1; }
  expect(isEqual(new A(), new A())).toBe(true);
  expect(isEqual(new A(), new B())).toBe(false);
  // Exercise real Arguments objects, which have non-enumerable built-in keys.
  // eslint-disable-next-line prefer-rest-params
  function args (...values: unknown[]) { void values; return arguments; }
  expect(isEqual(args(1), args(1))).toBe(true);
});

it('handles cyclic objects symmetrically and releases failed collection matches', () => {
  const left: { self?: unknown } = {};
  const right: { self?: unknown } = {};
  left.self = left;
  right.self = right;
  expect(isEqual(left, right)).toBe(true);
  const nested = { self: right };
  expect(isEqual(left, nested)).toBe(false);
  expect(isEqual(nested, left)).toBe(false);
  expect(isEqual(new Set([left, { n: 1 }]), new Set([{ n: 1 }, right]))).toBe(true);
  expect(isEqual(new Set([1]), new Set([1, 2]))).toBe(false);
});

it('retains native argument validation and accepts boxed string field names', () => {
  expect(diff([{ id: 1 }], [{ id: 1 }], Object('id'))).toEqual({
    added: [], removed: [], updated: [], same: [{ id: 1 }],
  });
  expect(() => diff([], [], 'id', null as never)).toThrow(/options/);
  expect(diff([], [], 'id', (() => {}) as never).same).toEqual([]);
});
