import { TesseraError } from '@tessera/core';
import { describe, expect, it, vi } from 'vitest';
import { makeEnv, seed, titles } from './helpers.js';

describe('boards', () => {
  it('creates a board with the default or given columns in order', async () => {
    const env = await makeEnv();
    const a = await env.api.createBoard({ title: 'Roadmap' });
    const b = await env.api.createBoard({ title: 'Custom', columns: ['X', 'Y'] });
    const boardA = await env.api.open(a.id);
    const boardB = await env.api.open(b.id);
    expect(boardA.state.get().columns.map((c) => c.title)).toEqual([
      'To do',
      'In progress',
      'Done',
    ]);
    expect(boardB.state.get().columns.map((c) => c.title)).toEqual(['X', 'Y']);
    expect((await env.api.listBoards()).map((x) => x.title)).toEqual(['Roadmap', 'Custom']);
    expect(env.events.some((e) => e.type === 'kanban:board-created')).toBe(true);
  });

  it('honours custom default columns from the config', async () => {
    const env = await makeEnv({ defaultColumns: ['Backlog', 'Doing'] });
    const board = await env.api.open((await env.api.createBoard({ title: 'T' })).id);
    expect(board.state.get().columns.map((c) => c.title)).toEqual(['Backlog', 'Doing']);
  });

  it('refuses to open a board that does not exist', async () => {
    const env = await makeEnv();
    await expect(env.api.open('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects an empty title', async () => {
    const env = await makeEnv();
    await expect(env.api.createBoard({ title: '  ' })).rejects.toBeInstanceOf(Error);
  });

  it('can be switched off with allow.createBoard', async () => {
    const env = await makeEnv({ allow: { createBoard: false } });
    await expect(env.api.createBoard({ title: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('renames the board', async () => {
    const env = await makeEnv();
    const { board } = await seed(env);
    await board.renameBoard('Renamed');
    expect(board.state.get().board?.title).toBe('Renamed');
    await board.history.undo();
    expect(board.state.get().board?.title).toBe('Test');
  });
});

describe('cards', () => {
  it('adds at the bottom by default and at the top on request', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['one', 'two']);
    await board.addCard(ids.A as string, { title: 'top' }, 'top');
    await board.addCard(ids.A as string, { title: 'bottom' });
    expect(titles(board, ids.A as string)).toEqual(['top', 'one', 'two', 'bottom']);
  });

  it('fills in defaults and who created the card', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env);
    const card = await board.addCard(ids.A as string, { title: 'x' });
    expect(card).toMatchObject({
      labelIds: [],
      assigneeIds: [],
      checklist: [],
      createdBy: env.user.id,
    });
    expect(card.createdAt).toBe(card.updatedAt);
  });

  it('validates input', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env);
    await expect(board.addCard(ids.A as string, { title: '' })).rejects.toBeInstanceOf(Error);
    await expect(board.addCard('missing', { title: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      board.addCard(ids.A as string, { title: 'x', dueDate: 'tomorrow' }),
    ).rejects.toBeInstanceOf(Error);
    expect(titles(board, ids.A as string)).toEqual([]);
  });

  it('updates fields, removes optional ones with undefined and emits an event', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['task']);
    const id = ids.task as string;
    env.clock.advance(1000);
    await board.updateCard(id, { dueDate: '2026-05-01', labelIds: ['l1'] });
    const card = board.state.get().cardsByColumn.get(ids.A as string)?.[0];
    expect(card).toMatchObject({ dueDate: '2026-05-01', labelIds: ['l1'] });
    expect(card?.updatedAt).not.toBe(card?.createdAt);
    await board.updateCard(id, { dueDate: undefined });
    expect(board.state.get().cardsByColumn.get(ids.A as string)?.[0]).not.toHaveProperty('dueDate');
    expect(env.events.filter((e) => e.type === 'kanban:card-updated')).toHaveLength(2);
  });

  it('does not save an invalid edit and keeps the old card', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['task']);
    await expect(board.updateCard(ids.task as string, { title: '' })).rejects.toBeInstanceOf(Error);
    expect(titles(board, ids.A as string)).toEqual(['task']);
    expect(board.history.state.get().canUndo).toBe(true);
    await board.history.undo();
    expect(titles(board, ids.A as string)).toEqual([]);
  });

  it('persists to storage so a second controller sees the same data', async () => {
    const env = await makeEnv({ sync: 'none' });
    const { board, ids } = await seed(env, ['persisted']);
    const again = await env.api.open(board.boardId);
    expect(titles(again, ids.A as string)).toEqual(['persisted']);
  });

  it('archives cards out of view but keeps them in the export', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['keep', 'hide']);
    await board.archiveCard(ids.hide as string);
    expect(titles(board, ids.A as string)).toEqual(['keep']);
    expect(board.state.get().cardCounts.get(ids.A as string)).toBe(1);
    expect(
      board
        .exportJSON()
        .cards.map((c) => c.title)
        .sort(),
    ).toEqual(['hide', 'keep']);
  });

  it('deletes cards', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['x', 'y']);
    await board.deleteCard(ids.x as string);
    expect(titles(board, ids.A as string)).toEqual(['y']);
    expect(env.events.at(-1)?.type).toBe('kanban:card-deleted');
    const again = await env.api.open(board.boardId);
    expect(titles(again, ids.A as string)).toEqual(['y']);
  });
});

describe('moving cards', () => {
  it('reorders within a column using the final position', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['1', '2', '3', '4']);
    const A = ids.A as string;
    expect(await board.moveCard(ids['1'] as string, A, 2)).toBe(true);
    expect(titles(board, A)).toEqual(['2', '3', '1', '4']);
    await board.moveCard(ids['4'] as string, A, 0);
    expect(titles(board, A)).toEqual(['4', '2', '3', '1']);
    await board.moveCard(ids['4'] as string, A, 99);
    expect(titles(board, A)).toEqual(['2', '3', '1', '4']);
  });

  it('moves between columns to any index, including an empty column', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['1', '2', '3']);
    const [A, B, C] = [ids.A, ids.B, ids.C] as [string, string, string];
    await board.moveCard(ids['2'] as string, B, 0);
    await board.moveCard(ids['1'] as string, B, 1);
    await board.moveCard(ids['3'] as string, B, 1);
    expect(titles(board, A)).toEqual([]);
    expect(titles(board, B)).toEqual(['2', '3', '1']);
    expect(titles(board, C)).toEqual([]);
    await board.moveCard(ids['3'] as string, C, 0);
    expect(titles(board, C)).toEqual(['3']);
  });

  it('writes only the moved card', async () => {
    const env = await makeEnv({ sync: 'none' });
    const { board, ids } = await seed(env, ['1', '2', '3']);
    const put = vi.spyOn(env.instance.ctx.storage(), 'put');
    await board.moveCard(ids['3'] as string, ids.A as string, 0);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]?.[1].id).toBe(ids['3']);
  });

  it('emits card-moved with both positions and treats a no-op as success', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['1', '2', '3']);
    env.events.length = 0;
    await board.moveCard(ids['1'] as string, ids.B as string, 0);
    expect(env.events).toHaveLength(1);
    expect(env.events[0]?.payload).toMatchObject({
      fromColumnId: ids.A,
      toColumnId: ids.B,
      fromIndex: 0,
      toIndex: 0,
    });
    env.events.length = 0;
    expect(await board.moveCard(ids['2'] as string, ids.A as string, 0)).toBe(true);
    expect(env.events).toHaveLength(0);
  });

  it('refuses unknown cards and columns', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['1']);
    await expect(board.moveCard('nope', ids.B as string, 0)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(board.moveCard(ids['1'] as string, 'nope', 0)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('blocks a move into a column at its WIP limit and says why', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['1', '2', '3']);
    const [A, B] = [ids.A, ids.B] as [string, string];
    await board.setWipLimit(B, 2);
    expect(await board.moveCard(ids['1'] as string, B, 0)).toBe(true);
    expect(await board.moveCard(ids['2'] as string, B, 0)).toBe(true);
    expect(await board.moveCard(ids['3'] as string, B, 0)).toBe(false);
    expect(titles(board, A)).toEqual(['3']);
    expect(env.events.at(-1)).toMatchObject({
      type: 'kanban:move-blocked',
      payload: { toColumnId: B, reason: 'wip' },
    });
    // Reordering inside the full column is still fine.
    expect(await board.moveCard(ids['1'] as string, B, 0)).toBe(true);
    await expect(board.addCard(B, { title: 'extra' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('ignores WIP limits when wipLimits is off', async () => {
    const env = await makeEnv({ wipLimits: false });
    const { board, ids } = await seed(env, ['1', '2']);
    await board.setWipLimit(ids.B as string, 1);
    expect(await board.moveCard(ids['1'] as string, ids.B as string, 0)).toBe(true);
    expect(await board.moveCard(ids['2'] as string, ids.B as string, 0)).toBe(true);
  });

  it('lets beforeCardMove veto, including asynchronously', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['1']);
    const hook = vi.fn(async () => false);
    env.api.configure({ beforeCardMove: hook });
    expect(await board.moveCard(ids['1'] as string, ids.B as string, 0)).toBe(false);
    expect(hook).toHaveBeenCalledWith(expect.objectContaining({ title: '1' }), ids.B);
    expect(env.events.at(-1)).toMatchObject({ payload: { reason: 'vetoed' } });
    env.api.configure({ beforeCardMove: undefined });
    expect(await board.moveCard(ids['1'] as string, ids.B as string, 0)).toBe(true);
  });

  it('respects allow.moveCard', async () => {
    const env = await makeEnv({ allow: { moveCard: false } });
    const { board, ids } = await seed(env, ['1']);
    await expect(board.moveCard(ids['1'] as string, ids.B as string, 0)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('keeps ranks short after many inserts at the same spot', async () => {
    const env = await makeEnv({ sync: 'none' });
    const { board, ids } = await seed(env, ['first', 'last']);
    const A = ids.A as string;
    const extras: string[] = [];
    for (let i = 0; i < 90; i++)
      extras.push((await board.addCard(A, { title: `m${i}` }, 'bottom')).id);
    // Always drop between the first card and its successor: ranks grow until they are rebalanced.
    for (const id of extras) await board.moveCard(id, A, 1);
    const ranks = (board.state.get().cardsByColumn.get(A) ?? []).map((c) => c.rank);
    expect(Math.max(...ranks.map((r) => r.length))).toBeLessThanOrEqual(64);
    expect([...ranks].sort()).toEqual(ranks);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(titles(board, A)[0]).toBe('first');
    expect(titles(board, A).at(-1)).toBe('last');
  });

  it('places a card among the visible ones while a filter hides others', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['apple', 'banana', 'avocado', 'cherry', 'apricot']);
    const A = ids.A as string;
    board.setFilter({ text: 'a' });
    // Visible: apple, banana, avocado, apricot (cherry has no "a"? it has none) -> cherry hidden.
    expect(titles(board, A)).toEqual(['apple', 'banana', 'avocado', 'apricot']);
    await board.moveCard(ids.apricot as string, A, 1);
    board.setFilter({ text: '' });
    expect(titles(board, A)).toEqual(['apple', 'apricot', 'banana', 'avocado', 'cherry']);
    board.setFilter({ text: 'a' });
    await board.moveCard(ids.apple as string, A, 99);
    board.setFilter({ text: '' });
    // Dropped after the last visible card, so ahead of the hidden "cherry".
    expect(titles(board, A)).toEqual(['apricot', 'banana', 'avocado', 'apple', 'cherry']);
  });
});

describe('columns', () => {
  it('adds, renames and reorders columns', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env);
    const added = await board.addColumn('Review', 1);
    expect(board.state.get().columns.map((c) => c.title)).toEqual(['A', 'Review', 'B', 'C']);
    await board.renameColumn(added.id, 'QA');
    await board.moveColumn(ids.C as string, 0);
    expect(board.state.get().columns.map((c) => c.title)).toEqual(['C', 'A', 'QA', 'B']);
    expect(env.events.filter((e) => e.type === 'kanban:column-moved')).toHaveLength(1);
    await board.moveColumn(ids.C as string, 0); // already there
    expect(env.events.filter((e) => e.type === 'kanban:column-moved')).toHaveLength(1);
  });

  it('deletes a column with its cards, or moves them first', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['1', '2']);
    const [A, B] = [ids.A, ids.B] as [string, string];
    await board.moveCard(ids['1'] as string, B, 0);
    await board.deleteColumn(A, { moveCardsTo: B });
    expect(board.state.get().columns.map((c) => c.title)).toEqual(['B', 'C']);
    expect(titles(board, B)).toEqual(['1', '2']);
    await board.deleteColumn(B);
    expect(board.state.get().cardsByColumn.size).toBe(0);
    expect(board.exportJSON().cards).toHaveLength(0);
    await expect(
      board.deleteColumn(ids.C as string, { moveCardsTo: ids.C as string }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('sets WIP limits, colour and collapsed state', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env);
    await board.setWipLimit(ids.A as string, 3);
    await board.updateColumn(ids.A as string, { color: 'red', collapsed: true });
    expect(board.state.get().columns[0]).toMatchObject({
      wipLimit: 3,
      color: 'red',
      collapsed: true,
    });
    await board.setWipLimit(ids.A as string, null);
    expect(board.state.get().columns[0]).not.toHaveProperty('wipLimit');
    await expect(board.setWipLimit(ids.A as string, 0)).rejects.toBeInstanceOf(Error);
  });

  it('honours the column capability switches', async () => {
    const env = await makeEnv({
      allow: {
        createColumn: false,
        renameColumn: false,
        deleteColumn: false,
        reorderColumns: false,
      },
    });
    const { board, ids } = await seed(env);
    for (const op of [
      () => board.addColumn('x'),
      () => board.renameColumn(ids.A as string, 'x'),
      () => board.deleteColumn(ids.A as string),
      () => board.moveColumn(ids.A as string, 1),
    ]) {
      await expect(op()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('respects allow.createCard and allow.deleteCard', async () => {
    const env = await makeEnv({ allow: { createCard: false, deleteCard: false } });
    const { board, ids } = await seed(env);
    await expect(board.addCard(ids.A as string, { title: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(board.deleteCard('x')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('labels', () => {
  it('adds, edits and deletes labels, removing them from cards', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['x', 'y']);
    const bug = await board.addLabel({ name: ' Bug ', color: 'red' });
    expect(bug.name).toBe('Bug');
    await board.updateCard(ids.x as string, { labelIds: [bug.id] });
    await board.updateLabel(bug.id, { name: 'Defect', color: 'orange' });
    expect(board.state.get().board?.labels).toEqual([
      { id: bug.id, name: 'Defect', color: 'orange' },
    ]);
    await board.deleteLabel(bug.id);
    expect(board.state.get().board?.labels).toEqual([]);
    expect(board.state.get().cardsByColumn.get(ids.A as string)?.[0]?.labelIds).toEqual([]);
    // One undo brings back the label and the card tag together.
    await board.history.undo();
    expect(board.state.get().board?.labels).toHaveLength(1);
    expect(board.state.get().cardsByColumn.get(ids.A as string)?.[0]?.labelIds).toEqual([bug.id]);
    await expect(board.updateLabel('nope', { name: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('errors', () => {
  it('exposes TesseraError instances', async () => {
    const env = await makeEnv();
    const { board } = await seed(env);
    const error = await board.updateCard('missing', { title: 'x' }).catch((e: unknown) => e);
    expect(TesseraError.is(error, 'NOT_FOUND')).toBe(true);
  });
});
