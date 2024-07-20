import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/** A rank longer than this triggers a rebalance of its column. */
export const MAX_RANK_LENGTH = 64;

/**
 * A key that sorts between `before` and `after` (either may be null for "no neighbour").
 * Returns null when the neighbours are equal or out of order, which only happens when two
 * clients created the same rank; the caller then rebalances and tries again.
 */
export function rankBetween(before: string | null, after: string | null): string | null {
  if (before !== null && after !== null && before >= after) return null;
  try {
    return generateKeyBetween(before, after);
  } catch {
    return null;
  }
}

/** `count` evenly spaced keys for a fresh list. */
export function evenRanks(count: number): string[] {
  return generateNKeysBetween(null, null, count);
}

/** The id list reordered so that `id` ends at `toIndex` (indexes counted without `id`). */
export function insertAt<T extends { id: string }>(
  items: readonly T[],
  moved: T,
  toIndex: number,
): T[] {
  const rest = items.filter((i) => i.id !== moved.id);
  const at = Math.min(Math.max(toIndex, 0), rest.length);
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}
