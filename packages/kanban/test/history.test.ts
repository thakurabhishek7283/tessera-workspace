import { describe, expect, it } from 'vitest';
import { makeEnv, seed, titles } from './helpers.js';

describe('undo and redo', () => {
  it('undoes and redoes adding a card', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env);
    await board.addCard(ids.A as string, { title: 'x' });
    await board.history.undo();
    expect(titles(board, ids.A as string)).toEqual([]);
    await board.history.redo();
    expect(titles(board, ids.A as string)).toEqual(['x']);
  });

  it('undoes a move to the exact previous place, within and across columns', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['1', '2', '3']);
    const [A, B] = [ids.A, ids.B] as [string, string];
    await board.moveCard(ids['1'] as string, A, 2);
    expect(titles(board, A)).toEqual(['2', '3', '1']);
    await board.history.undo();
    expect(titles(board, A)).toEqual(['1', '2', '3']);
    await board.moveCard(ids['2'] as string, B, 0);
    await board.history.undo();
    expect(titles(board, A)).toEqual(['1', '2', '3']);
    expect(titles(board, B)).toEqual([]);
    await board.history.redo();
    expect(titles(board, B)).toEqual(['2']);
  });

  it('emits card-moved for undo and redo too, so hosts stay in sync', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['1']);
    await board.moveCard(ids['1'] as string, ids.B as string, 0);
    env.events.length = 0;
    await board.history.undo();
    expect(env.events[0]).toMatchObject({
      type: 'kanban:card-moved',
      payload: { fromColumnId: ids.B, toColumnId: ids.A },
    });
  });

  it('undoes edits and merges rapid edits of the same field into one step', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['t']);
    const id = ids.t as string;
    await board.updateCard(id, { title: 'te' });
    await board.updateCard(id, { title: 'tes' });
    await board.updateCard(id, { title: 'test' });
    expect(titles(board, ids.A as string)).toEqual(['test']);
    await board.history.undo();
    expect(titles(board, ids.A as string)).toEqual(['t']);
    await board.history.redo();
    expect(titles(board, ids.A as string)).toEqual(['test']);
  });

  it('keeps edits of different fields as separate steps', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['t']);
    await board.updateCard(ids.t as string, { title: 'u' });
    await board.updateCard(ids.t as string, { dueDate: '2026-01-01' });
    await board.history.undo();
    const card = board.state.get().cardsByColumn.get(ids.A as string)?.[0];
    expect(card?.title).toBe('u');
    expect(card).not.toHaveProperty('dueDate');
  });

  it('does not merge edits that are far apart in time', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['t']);
    await board.updateCard(ids.t as string, { title: 'a' });
    env.clock.advance(2000);
    await board.updateCard(ids.t as string, { title: 'b' });
    await board.history.undo();
    expect(titles(board, ids.A as string)).toEqual(['a']);
  });

  it('restores a deleted card in its old place with its data', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['1', '2', '3']);
    await board.updateCard(ids['2'] as string, { dueDate: '2026-02-02', labelIds: ['l'] });
    env.clock.advance(2000);
    await board.deleteCard(ids['2'] as string);
    expect(titles(board, ids.A as string)).toEqual(['1', '3']);
    await board.history.undo();
    expect(titles(board, ids.A as string)).toEqual(['1', '2', '3']);
    expect(board.state.get().cardsByColumn.get(ids.A as string)?.[1]).toMatchObject({
      dueDate: '2026-02-02',
    });
    const again = await env.api.open(board.boardId);
    expect(titles(again, ids.A as string)).toEqual(['1', '2', '3']);
  });

  it('restores a deleted column with its cards, and a column whose cards were moved', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['1', '2']);
    const [A, B] = [ids.A, ids.B] as [string, string];
    await board.deleteColumn(A);
    expect(board.state.get().columns.map((c) => c.title)).toEqual(['B', 'C']);
    await board.history.undo();
    expect(board.state.get().columns.map((c) => c.title)).toEqual(['A', 'B', 'C']);
    expect(titles(board, A)).toEqual(['1', '2']);

    await board.deleteColumn(A, { moveCardsTo: B });
    expect(titles(board, B)).toEqual(['1', '2']);
    await board.history.undo();
    expect(titles(board, A)).toEqual(['1', '2']);
    expect(titles(board, B)).toEqual([]);
  });

  it('undoes column moves, renames and limits', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env);
    await board.moveColumn(ids.C as string, 0);
    await board.renameColumn(ids.A as string, 'Alpha');
    await board.setWipLimit(ids.B as string, 4);
    await board.history.undo();
    await board.history.undo();
    await board.history.undo();
    expect(board.state.get().columns.map((c) => c.title)).toEqual(['A', 'B', 'C']);
    expect(board.state.get().columns[1]).not.toHaveProperty('wipLimit');
  });

  it('clears the redo stack after a new action and reports labels for the UI', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['1']);
    await board.moveCard(ids['1'] as string, ids.B as string, 0);
    await board.history.undo();
    expect(board.history.state.get()).toMatchObject({
      canRedo: true,
      redoLabel: 'kanban.cmd.moveCard',
    });
    await board.addCard(ids.A as string, { title: 'new' });
    expect(board.history.state.get().canRedo).toBe(false);
    expect(board.history.state.get().undoLabel).toBe('kanban.cmd.addCard');
  });

  it('does not record an action that failed', async () => {
    const env = await makeEnv({ allow: { deleteCard: false } });
    const { board, ids } = await seed(env, ['1']);
    const before = board.history.state.get();
    await expect(board.deleteCard(ids['1'] as string)).rejects.toBeInstanceOf(Error);
    expect(board.history.state.get()).toEqual(before);
  });
});
