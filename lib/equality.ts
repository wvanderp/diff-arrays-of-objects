const tagOf = (value: unknown): string => Object.prototype.toString.call(value);
const sameValue = (left: unknown, right: unknown): boolean =>
  left === right || (Number.isNaN(left) && Number.isNaN(right));

/** Deep equality with ordered arrays and unordered Map/Set entries. */
export function isEqual (lhs: unknown, rhs: unknown): boolean {
  const activeLeft = new Map<object, object>();
  const activeRight = new Map<object, object>();

  function compare (left: unknown, right: unknown): boolean {
    if (sameValue(left, right)) return true;
    if (left === null || left === undefined || right === null || right === undefined) return false;
    const tag = tagOf(left);
    if (tag !== tagOf(right)) return false;

    // Boxed primitives compare by value, including against unboxed values.
    switch (tag) {
      case '[object Boolean]':
      case '[object Number]':
      case '[object Date]':
        return sameValue(Number(left), Number(right));
      case '[object String]':
      case '[object RegExp]':
        return (left as string | RegExp).toString() === (right as string | RegExp).toString();
      case '[object Symbol]':
        return Symbol.prototype.valueOf.call(left) === Symbol.prototype.valueOf.call(right);
      case '[object BigInt]':
        return BigInt.prototype.valueOf.call(left) === BigInt.prototype.valueOf.call(right);
      case '[object Error]':
        return (left as Error).name === (right as Error).name
          && (left as Error).message === (right as Error).message;
      default: break;
    }
    if (typeof left !== 'object' || typeof right !== 'object') return false;
    if (activeLeft.has(left) || activeRight.has(right)) {
      return activeLeft.get(left) === right && activeRight.get(right) === left;
    }
    activeLeft.set(left, right);
    activeRight.set(right, left);
    try {
      if (Array.isArray(left)) {
        const other = right as unknown[];
        if (left.length !== other.length) return false;
        for (let index = 0; index < left.length; index++) {
          if (!compare(left[index], other[index])) return false;
        }
        return true;
      }
      if (left instanceof Map || left instanceof Set) {
        const other = right as Map<unknown, unknown> | Set<unknown>;
        if (left.size !== other.size) return false;
        // Map entries stay ordered pairs, so a key cannot match a value.
        const remaining: unknown[] = Array.from(other.entries());
        for (const entry of left.entries()) {
          const index = remaining.findIndex(candidate => compare(entry, candidate));
          if (index < 0) return false;
          remaining.splice(index, 1);
        }
        return true;
      }
      if (ArrayBuffer.isView(left)) {
        if (left instanceof DataView) {
          const other = right as DataView;
          return left.byteOffset === other.byteOffset && left.byteLength === other.byteLength
            && compare(left.buffer, other.buffer);
        }
        const values = left as unknown as ArrayLike<unknown>;
        const other = right as unknown as ArrayLike<unknown>;
        if (values.length !== other.length) return false;
        for (let index = 0; index < values.length; index++) {
          if (!sameValue(values[index], other[index])) return false;
        }
        return true;
      }
      if (tag === '[object ArrayBuffer]') {
        return compare(new Uint8Array(left as ArrayBuffer), new Uint8Array(right as ArrayBuffer));
      }
      if (tag !== '[object Object]' && tag !== '[object Arguments]') return false;
      const a = left as Record<PropertyKey, unknown>;
      const b = right as Record<PropertyKey, unknown>;
      const keys = (value: object): PropertyKey[] => Reflect.ownKeys(value)
        .filter(key => Object.prototype.propertyIsEnumerable.call(value, key));
      const leftKeys = keys(left);
      if (leftKeys.length !== keys(right).length) return false;
      if (!leftKeys.every(key => Object.hasOwn(right, key) && compare(a[key], b[key]))) return false;
      // Different class instances are distinct; null-prototype records are plain records.
      return Object.hasOwn(left, 'constructor') || !('constructor' in left)
        || !('constructor' in right) || a.constructor === b.constructor;
    } finally {
      activeLeft.delete(left);
      activeRight.delete(right);
    }
  }

  return compare(lhs, rhs);
}
