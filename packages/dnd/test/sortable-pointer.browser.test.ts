import { cleanup, must } from '@tessera-internal/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSortable as create, type MoveEvent, type Sortable } from '../src/index.js';
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
/** Every sortable is destroyed after its test so document-level listeners cannot leak between tests. */
const createSortable = (...args: Parameters<typeof create>): Sortable => {
  const sortable = create(...args);
  created.push(sortable);
  return sortable;
};

afterEach(() => {
  for (const sortable of created.splice(0)) sortable.destroy();
  cleanup();
});

function setup(
  layout: Record<string, string[]>,
  opts: Partial<Parameters<typeof createSortable>[0]> = {},
) {
  const board = createBoard(layout, { handle: Boolean(opts.handleSelector) });
  const onMove = vi.fn<(e: MoveEvent) => void>();
  const announced: string[] = [];
  const sortable = createSortable({
    root: must(board.host.shadowRoot),
    containers: board.containers,
    axis: 'vertical',
    onMove,
    announce: (m) => announced.push(m),
    messages,
    ...opts,
  });
  const item = (id: string) => must(board.items.get(id), id);
  const drag = async (id: string, to: { x: number; y: number }, steps = 3) => {
    const from = center(item(id));
    pointerDown(item(id), from.x, from.y);
    for (let i = 1; i <= steps; i++) {
      pointerMove(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
      await frames(1);
    }
    await frames(2);
  };
  return { board, onMove, sortable, item, drag, announced };
}

describe('pointer dragging', () => {
  it('reorders within a list: dropping below the next item moves down by one', async () => {
    const { onMove, drag, item } = setup({ a: ['1', '2', '3'] });
    const below2 = center(item('2'));
    await drag('1', { x: below2.x, y: below2.y + 15 });
    pointerUp(below2.x, below2.y + 15);
    await frames();
    expect(onMove).toHaveBeenCalledExactlyOnceWith({
      itemId: '1',
      fromContainer: 'a',
      toContainer: 'a',
      fromIndex: 0,
      toIndex: 1,
    });
  });

  it('moves to the top of another list and to the end of a longer one', async () => {
    const { onMove, drag, item, board } = setup({ a: ['1', '2'], b: ['x', 'y', 'z'] });
    const top = center(item('x'));
    await drag('2', { x: top.x, y: top.y - 18 });
    pointerUp(top.x, top.y - 18);
    await frames();
    expect(onMove).toHaveBeenLastCalledWith({
      itemId: '2',
      fromContainer: 'a',
      toContainer: 'b',
      fromIndex: 1,
      toIndex: 0,
    });

    const bottom = center(item('z'));
    await drag('1', { x: bottom.x, y: bottom.y + 60 });
    pointerUp(bottom.x, bottom.y + 60);
    await frames();
    expect(onMove).toHaveBeenLastCalledWith({
      itemId: '1',
      fromContainer: 'a',
      toContainer: 'b',
      fromIndex: 0,
      toIndex: 3,
    });
    expect(board.host.shadowRoot?.querySelector('[data-dnd-ghost]')).toBeNull();
  });

  it('can drop into an empty list, and into the nearest list when released in a gap', async () => {
    const { onMove, drag, board } = setup({ a: ['1'], b: [] });
    const target = must(board.columns.get('b')).getBoundingClientRect();
    await drag('1', { x: target.left + 30, y: target.top + 20 });
    pointerUp(target.left + 30, target.top + 20);
    await frames();
    expect(onMove).toHaveBeenLastCalledWith({
      itemId: '1',
      fromContainer: 'a',
      toContainer: 'b',
      fromIndex: 0,
      toIndex: 0,
    });

    onMove.mockClear();
    // The columns are 20px apart; 15px past a's edge is 5px from b, so b wins.
    const gap = {
      x: must(board.columns.get('a')).getBoundingClientRect().right + 15,
      y: target.top + 20,
    };
    await drag('1', gap);
    pointerUp(gap.x, gap.y);
    await frames();
    expect(onMove).toHaveBeenCalledExactlyOnceWith({
      itemId: '1',
      fromContainer: 'a',
      toContainer: 'b',
      fromIndex: 0,
      toIndex: 0,
    });
  });

  it('marks the origin, the target list and where the item will land while dragging', async () => {
    const { drag, item, board } = setup({ a: ['1', '2'], b: ['x', 'y'] });
    const y = center(item('y'));
    await drag('1', { x: y.x, y: y.y - 15 });
    expect(item('1').hasAttribute('data-dragging')).toBe(true);
    expect(must(board.columns.get('b')).hasAttribute('data-drop-target')).toBe(true);
    expect(item('y').hasAttribute('data-drop-before')).toBe(true);
    expect(must(board.columns.get('b')).style.getPropertyValue('--dnd-item-height')).toBe('40px');
    expect(document.querySelector('[data-dnd-ghost]')).not.toBeNull();
    pointerUp(y.x, y.y - 15);
    await frames();
    expect(item('1').hasAttribute('data-dragging')).toBe(false);
    expect(
      board.host.shadowRoot?.querySelector(
        '[data-drop-target], [data-drop-before], [data-drop-end]',
      ),
    ).toBeNull();
    expect(document.querySelector('[data-dnd-ghost]')).toBeNull();
    expect(document.documentElement.hasAttribute('data-dnd-active')).toBe(false);
  });

  it('announces a drop and a cancel', async () => {
    const { drag, item, announced } = setup({ a: ['1', '2'], b: ['x'] });
    const x = center(item('x'));
    await drag('1', { x: x.x, y: x.y + 20 });
    pointerUp(x.x, x.y + 20);
    await frames();
    expect(announced).toEqual(['Dropped 1 at position 2 of 2 in b']);
    await drag('2', { x: x.x, y: x.y });
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(announced.at(-1)).toBe('Cancelled moving 2');
  });

  it('marks the last item when dropping at the end', async () => {
    const { drag, item } = setup({ a: ['1'], b: ['x', 'y'] });
    const y = center(item('y'));
    await drag('1', { x: y.x, y: y.y + 20 });
    expect(item('y').hasAttribute('data-drop-end')).toBe(true);
    pointerUp(y.x, y.y + 20);
  });

  it('does nothing when the item is dropped where it started', async () => {
    const { onMove, drag, item } = setup({ a: ['1', '2', '3'] });
    const c = center(item('2'));
    await drag('2', { x: c.x + 10, y: c.y + 2 });
    pointerUp(c.x + 10, c.y + 2);
    await frames();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('ignores movements under the threshold, so a click is still a click', async () => {
    const { onMove, item, sortable } = setup({ a: ['1', '2'] });
    const c = center(item('1'));
    const onClick = vi.fn();
    item('1').addEventListener('click', onClick);
    pointerDown(item('1'), c.x, c.y);
    pointerMove(c.x + 2, c.y + 1);
    await frames();
    expect(sortable.dragging).toBe(false);
    pointerUp(c.x + 2, c.y + 1);
    item('1').click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('swallows the click that follows a drag', async () => {
    const { drag, item } = setup({ a: ['1', '2'] });
    const onClick = vi.fn();
    item('1').addEventListener('click', onClick);
    const c = center(item('2'));
    await drag('1', { x: c.x, y: c.y + 15 });
    pointerUp(c.x, c.y + 15);
    item('1').click();
    expect(onClick).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 10));
    item('1').click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('cancels with Escape or pointercancel and cleans up', async () => {
    const { onMove, drag, item, sortable } = setup({ a: ['1', '2', '3'] });
    const c = center(item('3'));
    await drag('1', { x: c.x, y: c.y + 15 });
    expect(sortable.dragging).toBe(true);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await frames();
    expect(sortable.dragging).toBe(false);
    expect(document.querySelector('[data-dnd-ghost]')).toBeNull();
    expect(item('1').hasAttribute('data-dragging')).toBe(false);

    await drag('1', { x: c.x, y: c.y + 15 });
    document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
    await frames();
    expect(sortable.dragging).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('leaves buttons and inputs inside an item alone', async () => {
    const { board, sortable } = setup({ a: ['1', '2'] });
    const button = must(board.items.get('1')?.querySelector('button'));
    const r = button.getBoundingClientRect();
    pointerDown(button, r.left + 2, r.top + 2);
    pointerMove(r.left + 40, r.top + 60);
    await frames();
    expect(sortable.dragging).toBe(false);
  });

  it('with a handle selector only starts from the handle, even inside the item', async () => {
    const { board, sortable, onMove, item } = setup({ a: ['1', '2'] }, { handleSelector: '.grip' });
    const grip = must(item('1').querySelector('.grip'));
    const label = must(item('1').querySelector('span:not(.grip)'));
    const l = label.getBoundingClientRect();
    pointerDown(label, l.left + 2, l.top + 2);
    pointerMove(l.left + 60, l.top + 100);
    await frames();
    expect(sortable.dragging).toBe(false);
    pointerUp(l.left + 60, l.top + 100);

    const g = grip.getBoundingClientRect();
    const target = center(item('2'));
    pointerDown(grip, g.left + 5, g.top + 5);
    pointerMove(target.x, target.y + 15);
    await frames(3);
    expect(sortable.dragging).toBe(true);
    pointerUp(target.x, target.y + 15);
    await frames();
    expect(onMove).toHaveBeenCalledOnce();
    void board;
  });

  it('respects accepts() and canDrag()', async () => {
    const board = createBoard({ a: ['1', '2'], b: ['x'] });
    const onMove = vi.fn();
    createSortable({
      root: must(board.host.shadowRoot),
      containers: () =>
        board.containers().map((c) => (c.id === 'b' ? { ...c, accepts: () => false } : c)),
      axis: 'vertical',
      onMove,
      announce: () => undefined,
      messages,
      canDrag: (id) => id !== '2',
    });
    const one = must(board.items.get('1'));
    const x = center(must(board.items.get('x')));
    const c = center(one);
    pointerDown(one, c.x, c.y);
    pointerMove(x.x, x.y);
    await frames(3);
    pointerUp(x.x, x.y);
    await frames();
    // b refuses, so the nearest accepting list (a) is the target and the item ends where it began.
    expect(onMove).not.toHaveBeenCalled();

    const two = must(board.items.get('2'));
    const t = center(two);
    pointerDown(two, t.x, t.y);
    pointerMove(t.x, t.y + 60);
    await frames(3);
    expect(document.querySelector('[data-dnd-ghost]')).toBeNull();
  });

  it('uses the custom ghost and ghost parent', async () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const { drag, item } = setup(
      { a: ['1', '2'] },
      {
        createGhost: (it) => {
          const g = document.createElement('div');
          g.textContent = `ghost ${it.id}`;
          return g;
        },
        ghostParent: () => parent,
      },
    );
    const c = center(item('2'));
    await drag('1', { x: c.x, y: c.y + 15 });
    expect(parent.querySelector('[data-dnd-ghost]')?.textContent).toBe('ghost 1');
    pointerUp(c.x, c.y + 15);
  });

  it('long-presses before dragging on touch, and scrolling cancels the press', async () => {
    const { sortable, item } = setup({ a: ['1', '2'] });
    const c = center(item('1'));
    pointerDown(item('1'), c.x, c.y, { pointerType: 'touch' });
    pointerMove(c.x, c.y + 30, { pointerType: 'touch' });
    await new Promise((r) => setTimeout(r, 260));
    expect(sortable.dragging).toBe(false);
    pointerUp(c.x, c.y + 30, { pointerType: 'touch' });

    pointerDown(item('1'), c.x, c.y, { pointerType: 'touch' });
    await new Promise((r) => setTimeout(r, 260));
    expect(sortable.dragging).toBe(true);
    pointerUp(c.x, c.y, { pointerType: 'touch' });
  });

  it('stops listening after destroy()', async () => {
    const { sortable, item } = setup({ a: ['1', '2'] });
    sortable.destroy();
    const c = center(item('1'));
    pointerDown(item('1'), c.x, c.y);
    pointerMove(c.x, c.y + 60);
    await frames(2);
    expect(sortable.dragging).toBe(false);
  });
});
