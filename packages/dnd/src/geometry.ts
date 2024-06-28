export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

export type Axis = 'vertical' | 'horizontal';

/**
 * Where a dragged item would land among `rects` (the items that stay put, in order): the number
 * of items whose midpoint, measured along `axis`, lies before the pointer. Works for any length,
 * including an empty list.
 */
export function dropIndex(rects: readonly Box[], point: Point, axis: Axis): number {
  let index = 0;
  for (const rect of rects) {
    const mid = axis === 'vertical' ? (rect.top + rect.bottom) / 2 : (rect.left + rect.right) / 2;
    const at = axis === 'vertical' ? point.y : point.x;
    if (at > mid) index++;
  }
  return index;
}

const contains = (box: Box, p: Point): boolean =>
  p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom;

/** Distance from a point to the nearest edge of a box (0 inside). */
export function distanceTo(box: Box, p: Point): number {
  const dx = Math.max(box.left - p.x, 0, p.x - box.right);
  const dy = Math.max(box.top - p.y, 0, p.y - box.bottom);
  return Math.hypot(dx, dy);
}

/**
 * The container the pointer is over; otherwise the nearest one, so dragging through a gap
 * between columns keeps the last sensible target. Returns `undefined` for an empty list.
 */
export function pickContainer<T extends { box: Box }>(candidates: readonly T[], point: Point): T | undefined {
  const inside = candidates.find((c) => contains(c.box, point));
  if (inside) return inside;
  let best: T | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const d = distanceTo(c.box, point);
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Scroll step for a pointer at `pos` inside a scroller spanning `start`..`end`: negative near the
 * start edge, positive near the end edge, proportional to how deep into the `edge` band it is.
 */
export function edgeSpeed(pos: number, start: number, end: number, edge = 48, max = 18): number {
  if (end - start < edge * 2) return 0;
  if (pos < start + edge) return -Math.round(max * Math.min(1, (start + edge - pos) / edge));
  if (pos > end - edge) return Math.round(max * Math.min(1, (pos - (end - edge)) / edge));
  return 0;
}
