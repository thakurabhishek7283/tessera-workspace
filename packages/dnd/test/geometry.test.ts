import { describe, expect, it } from 'vitest';
import { type Box, distanceTo, dropIndex, edgeSpeed, pickContainer } from '../src/geometry.js';

const col = (top: number, height = 40): Box => ({ left: 0, top, right: 100, bottom: top + height });
const rects = [col(0), col(50), col(100)]; // midpoints 20, 70, 120

describe('dropIndex', () => {
  it('counts the items whose midpoint is before the pointer', () => {
    expect(dropIndex(rects, { x: 10, y: -20 }, 'vertical')).toBe(0);
    expect(dropIndex(rects, { x: 10, y: 20 }, 'vertical')).toBe(0);
    expect(dropIndex(rects, { x: 10, y: 21 }, 'vertical')).toBe(1);
    expect(dropIndex(rects, { x: 10, y: 95 }, 'vertical')).toBe(2);
    expect(dropIndex(rects, { x: 10, y: 400 }, 'vertical')).toBe(3);
  });

  it('works horizontally and with an empty list', () => {
    const row: Box[] = [
      { left: 0, top: 0, right: 100, bottom: 50 },
      { left: 110, top: 0, right: 210, bottom: 50 },
    ];
    expect(dropIndex(row, { x: 120, y: 10 }, 'horizontal')).toBe(1);
    expect(dropIndex(row, { x: 500, y: 10 }, 'horizontal')).toBe(2);
    expect(dropIndex([], { x: 5, y: 5 }, 'vertical')).toBe(0);
  });
});

describe('pickContainer', () => {
  const boxes = [
    { id: 'a', box: { left: 0, top: 0, right: 100, bottom: 400 } },
    { id: 'b', box: { left: 120, top: 0, right: 220, bottom: 400 } },
  ];

  it('prefers the container under the pointer', () => {
    expect(pickContainer(boxes, { x: 150, y: 10 })?.id).toBe('b');
  });

  it('falls back to the nearest container in a gap or outside', () => {
    expect(pickContainer(boxes, { x: 108, y: 10 })?.id).toBe('a');
    expect(pickContainer(boxes, { x: 112, y: 10 })?.id).toBe('b');
    expect(pickContainer(boxes, { x: 900, y: 900 })?.id).toBe('b');
    expect(pickContainer([], { x: 1, y: 1 })).toBeUndefined();
  });
});

describe('distanceTo', () => {
  it('is zero inside and measures to the nearest edge or corner outside', () => {
    const box = col(0, 100);
    expect(distanceTo(box, { x: 10, y: 10 })).toBe(0);
    expect(distanceTo(box, { x: 130, y: 50 })).toBe(30);
    expect(distanceTo(box, { x: 103, y: 104 })).toBe(5);
  });
});

describe('edgeSpeed', () => {
  it('is zero in the middle and grows towards the edges', () => {
    expect(edgeSpeed(300, 0, 600)).toBe(0);
    expect(edgeSpeed(0, 0, 600)).toBe(-18);
    expect(edgeSpeed(24, 0, 600)).toBe(-9);
    expect(edgeSpeed(600, 0, 600)).toBe(18);
    expect(edgeSpeed(576, 0, 600)).toBe(9);
  });

  it('never scrolls a scroller that is smaller than its two edge bands', () => {
    expect(edgeSpeed(10, 0, 80)).toBe(0);
  });
});
