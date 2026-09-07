import isEqualWith from 'lodash/isEqualWith.js';

type Collection = Map<unknown, unknown> | Set<unknown>;

function isCollection (value: unknown): value is Collection {
  return value instanceof Map || value instanceof Set;
}

/** Lodash equality with unordered collections but ordered keys and values. */
export function isEqual (lhs: unknown, rhs: unknown): boolean {
  const active = new Map<Collection, Collection>();

  function compare (left: unknown, right: unknown): boolean {
    return isEqualWith(left, right, compareCollections);
  }

  function compareCollections (left: unknown, right: unknown): boolean | undefined {
    if (!isCollection(left) && !isCollection(right)) return undefined;
    if (!isCollection(left) || !isCollection(right)
      || (left instanceof Map) !== (right instanceof Map)
      || left.size !== right.size) return false;
    if (active.has(left)) return active.get(left) === right;

    active.set(left, right);
    // Wrapping Map entries in objects preserves each key/value association.
    const entries = (value: Collection): unknown[] => value instanceof Map
      ? Array.from(value, ([key, item]) => ({ key, value: item }))
      : Array.from(value);
    const remaining = entries(right);
    const equal = entries(left).every((entry) => {
      const index = remaining.findIndex(candidate => compare(entry, candidate));
      if (index < 0) return false;
      remaining.splice(index, 1);
      return true;
    });
    active.delete(left);
    return equal;
  }

  return compare(lhs, rhs);
}
