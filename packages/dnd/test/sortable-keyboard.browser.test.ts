import { cleanup, must } from '@tessera-internal/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createSortable as create, type MoveEvent, type Sortable } from '../src/index.js';
import { createBoard, frames, messages } from './helpers.js';

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
  const board = createBoard(layout);
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
  return { board, onMove, announced, sortable, item };
}

describe('keyboard sorting', () => {
  it('lifts with Space, moves with the arrows, drops with Space', async () => {
    const { onMove, announced, item, sortable } = setup({ a: ['1', '2', '3'] });
    item('1').focus();
    await userEvent.keyboard(' ');
    expect(sortable.dragging).toBe(true);
    expect(item('1').hasAttribute('data-dragging')).toBe(true);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(item('3').hasAttribute('data-drop-end')).toBe(true);
    await userEvent.keyboard(' ');
    await frames();
    expect(onMove).toHaveBeenCalledExactlyOnceWith({
      itemId: '1',
      fromContainer: 'a',
      toContainer: 'a',
      fromIndex: 0,
      toIndex: 2,
    });
    expect(announced).toEqual([
      'Lifted 1, position 1 of 3 in a',
      'Moved 1 to position 2 of 3 in a',
      'Moved 1 to position 3 of 3 in a',
      'Dropped 1 at position 3 of 3 in a',
    ]);
    expect(sortable.dragging).toBe(false);
    expect(item('1').hasAttribute('data-dragging')).toBe(false);
  });

  it('stays within bounds and does not announce moves that do nothing', async () => {
    const { announced, item } = setup({ a: ['1', '2'] });
    item('1').focus();
    await userEvent.keyboard(' {ArrowUp}{ArrowUp}');
    expect(announced).toEqual(['Lifted 1, position 1 of 2 in a']);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(announced.filter((m) => m.startsWith('Moved'))).toEqual([
      'Moved 1 to position 2 of 2 in a',
    ]);
  });

  it('moves between lists with Left and Right and clamps the index', async () => {
    const { onMove, announced, item } = setup({ a: ['1', '2', '3'], b: ['x'], c: [] });
    item('3').focus();
    await userEvent.keyboard('{Enter}');
    expect(announced).toEqual(['Lifted 3, position 3 of 3 in a']);
    await userEvent.keyboard('{ArrowRight}');
    expect(announced.at(-1)).toBe('Moved 3 to position 2 of 2 in b');
    await userEvent.keyboard('{ArrowRight}');
    expect(announced.at(-1)).toBe('Moved 3 to position 1 of 1 in c');
    await userEvent.keyboard('{ArrowRight}');
    expect(announced.at(-1)).toBe('Moved 3 to position 1 of 1 in c');
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{Enter}');
    await frames();
    expect(onMove).toHaveBeenCalledExactlyOnceWith({
      itemId: '3',
      fromContainer: 'a',
      toContainer: 'a',
      fromIndex: 2,
      // The empty list pulled the index down to 0 and it does not spring back.
      toIndex: 0,
    });
  });

  it('cancels with Escape and leaves everything as it was', async () => {
    const { onMove, announced, item, sortable } = setup({ a: ['1', '2'] });
    item('1').focus();
    await userEvent.keyboard(' {ArrowDown}{Escape}');
    expect(sortable.dragging).toBe(false);
    expect(announced.at(-1)).toBe('Cancelled moving 1');
    expect(onMove).not.toHaveBeenCalled();
    expect(item('1').hasAttribute('data-dragging')).toBe(false);
    expect(item('2').hasAttribute('data-drop-end')).toBe(false);
  });

  it('returns focus to the item after a drop', async () => {
    const { item } = setup({ a: ['1', '2'] });
    item('1').focus();
    await userEvent.keyboard(' {ArrowDown} ');
    await frames(3);
    expect(item('1').getRootNode()).toBeInstanceOf(ShadowRoot);
    expect((item('1').getRootNode() as ShadowRoot).activeElement).toBe(item('1'));
  });

  it('uses Left and Right within a list when the axis is horizontal', async () => {
    const { announced, item } = setup({ a: ['1', '2'] }, { axis: 'horizontal' });
    item('1').focus();
    await userEvent.keyboard(' {ArrowDown}');
    expect(announced).toEqual(['Lifted 1, position 1 of 2 in a']);
    await userEvent.keyboard('{ArrowRight}');
    expect(announced.at(-1)).toBe('Moved 1 to position 2 of 2 in a');
  });

  it('only lifts from the item itself, never from a control inside it', async () => {
    const { item, sortable } = setup({ a: ['1', '2'] });
    const button = must(item('1').querySelector('button'));
    button.focus();
    await userEvent.keyboard(' ');
    expect(sortable.dragging).toBe(false);
  });

  it('honours liftKeys so Enter can keep its own meaning', async () => {
    const { item, sortable } = setup({ a: ['1', '2'] }, { liftKeys: [' '] });
    item('1').focus();
    await userEvent.keyboard('{Enter}');
    expect(sortable.dragging).toBe(false);
    await userEvent.keyboard(' ');
    expect(sortable.dragging).toBe(true);
    await userEvent.keyboard('{Escape}');
  });

  it('skips lists that refuse the item', async () => {
    const board = createBoard({ a: ['1'], b: ['x'], c: ['y'] });
    const announced: string[] = [];
    createSortable({
      root: must(board.host.shadowRoot),
      containers: () =>
        board.containers().map((c) => (c.id === 'b' ? { ...c, accepts: () => false } : c)),
      axis: 'vertical',
      onMove: () => undefined,
      announce: (m) => announced.push(m),
      messages,
    });
    must(board.items.get('1')).focus();
    await userEvent.keyboard(' {ArrowRight}');
    expect(announced.at(-1)).toBe('Moved 1 to position 1 of 2 in c');
    await userEvent.keyboard('{Escape}');
  });

  it('cancels when the pointer is used instead', async () => {
    const { item, sortable, announced } = setup({ a: ['1', '2'] });
    item('1').focus();
    await userEvent.keyboard(' ');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(sortable.dragging).toBe(false);
    expect(announced.at(-1)).toBe('Cancelled moving 1');
  });

  it('uses labelOf and containerLabel in announcements', async () => {
    const { item, announced } = setup(
      { todo: ['1'] },
      { labelOf: (i) => `Card ${i.id}`, containerLabel: (c) => `Column ${c.id}` },
    );
    item('1').focus();
    await userEvent.keyboard(' ');
    expect(announced).toEqual(['Lifted Card 1, position 1 of 1 in Column todo']);
    await userEvent.keyboard('{Escape}');
  });
});
