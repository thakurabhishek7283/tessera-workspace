import { cleanup, must } from '@tessera-internal/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSortable, type MoveEvent, type Sortable } from '../src/index.js';
import {
  center,
  createBoard,
  frames,
  messages,
  pointerDown,
  pointerMove,
  pointerUp,
} from './helpers.js';

const created: Sortable[] = [];
afterEach(() => {
  for (const s of created.splice(0)) s.destroy();
  cleanup();
});

function setup(layout: Record<string, string[]>) {
  const board = createBoard(layout);
  const onMove = vi.fn<(e: MoveEvent) => void>();
  created.push(
    createSortable({
      root: must(board.host.shadowRoot),
      containers: board.containers,
      axis: 'vertical',
      onMove,
      announce: () => undefined,
      messages,
    }),
  );
  return { board, onMove };
}

const items = (n: number) => Array.from({ length: n }, (_, i) => `i${i}`);

describe('auto-scroll while dragging', () => {
  it('scrolls a list down while the pointer rests near its bottom edge and keeps retargeting', async () => {
    const { board, onMove } = setup({ a: items(12) });
    const col = must(board.columns.get('a'));
    col.style.cssText = 'height:160px;overflow-y:auto;';
    await frames();
    const rect = col.getBoundingClientRect();
    const first = must(board.items.get('i0'));
    const start = center(first);
    pointerDown(first, start.x, start.y);
    const edge = { x: start.x, y: rect.bottom - 6 };
    pointerMove(edge.x, edge.y);
    await frames(2);
    const before = col.scrollTop;
    await new Promise((r) => setTimeout(r, 250));
    expect(col.scrollTop).toBeGreaterThan(before);
    pointerUp(edge.x, edge.y);
    await frames();
    const call = onMove.mock.calls[0]?.[0];
    expect(call?.itemId).toBe('i0');
    // It travelled well past the items that were visible when the drag began.
    expect(call?.toIndex).toBeGreaterThan(3);
  });

  it('scrolls back up near the top edge', async () => {
    const { board } = setup({ a: items(12) });
    const col = must(board.columns.get('a'));
    col.style.cssText = 'height:160px;overflow-y:auto;';
    col.scrollTop = 300;
    await frames();
    const rect = col.getBoundingClientRect();
    const target = must(board.items.get('i8'));
    const c = center(target);
    pointerDown(target, c.x, c.y);
    pointerMove(c.x, rect.top + 6);
    await new Promise((r) => setTimeout(r, 250));
    expect(col.scrollTop).toBeLessThan(300);
    pointerUp(c.x, rect.top + 6);
  });

  it('scrolls sideways when the board is wider than its container', async () => {
    const { board } = setup({ a: ['1'], b: ['2'], c: ['3'], d: ['4'] });
    board.host.style.cssText = 'display:flex;width:300px;overflow-x:auto;';
    for (const col of board.columns.values()) col.style.flex = 'none';
    await frames();
    const rect = board.host.getBoundingClientRect();
    const item = must(board.items.get('1'));
    const c = center(item);
    pointerDown(item, c.x, c.y);
    pointerMove(rect.right - 6, c.y);
    await new Promise((r) => setTimeout(r, 250));
    expect(board.host.scrollLeft).toBeGreaterThan(0);
    pointerUp(rect.right - 6, c.y);
  });

  it('does not scroll while the pointer is in the middle', async () => {
    const { board } = setup({ a: items(12) });
    const col = must(board.columns.get('a'));
    col.style.cssText = 'height:200px;overflow-y:auto;';
    await frames();
    const rect = col.getBoundingClientRect();
    const first = must(board.items.get('i0'));
    const c = center(first);
    pointerDown(first, c.x, c.y);
    pointerMove(c.x, rect.top + rect.height / 2);
    await new Promise((r) => setTimeout(r, 200));
    expect(col.scrollTop).toBe(0);
    pointerUp(c.x, rect.top + rect.height / 2);
  });
});
