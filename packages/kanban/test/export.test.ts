import { describe, expect, it } from 'vitest';
import { makeEnv, seed } from './helpers.js';

describe('export and import', () => {
  it('round-trips a board into a fresh one (replace)', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['1', '2']);
    const bug = await board.addLabel({ name: 'Bug', color: 'red' });
    await board.updateCard(ids['1'] as string, { labelIds: [bug.id], dueDate: '2026-06-01' });
    await board.moveCard(ids['2'] as string, ids.B as string, 0);
    const data = JSON.parse(JSON.stringify(board.exportJSON()));

    const other = await env.api.open(
      (await env.api.createBoard({ title: 'Copy', columns: ['junk'] })).id,
    );
    await other.importJSON(data, 'replace');
    const state = other.state.get();
    expect(state.columns.map((c) => c.title)).toEqual(['A', 'B', 'C']);
    expect(state.board?.title).toBe('Test');
    expect(state.board?.labels.map((l) => l.name)).toEqual(['Bug']);
    expect(state.board?.id).toBe(other.boardId);
    const imported = state.columns.map(
      (c) =>
        other.state
          .get()
          .cardsByColumn.get(c.id)
          ?.map((card) => card.title) ?? [],
    );
    expect(imported).toEqual([['1'], ['2'], []]);
    const first = other.state.get().cardsByColumn.get(state.columns[0]?.id as string)?.[0];
    expect(first).toMatchObject({
      boardId: other.boardId,
      dueDate: '2026-06-01',
      labelIds: [bug.id],
    });
    expect(first?.id).not.toBe(ids['1']);
    // Persisted too, and the old content is gone.
    const reopened = await env.api.open(other.boardId);
    expect(reopened.state.get().columns).toHaveLength(3);
  });

  it('merge appends copies with new ids and reuses labels with the same name', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['1']);
    await board.addLabel({ name: 'Bug', color: 'red' });
    const labelId = board.state.get().board?.labels[0]?.id as string;
    await board.updateCard(ids['1'] as string, { labelIds: [labelId] });
    const data = board.exportJSON();
    await board.importJSON(data, 'merge');
    await board.importJSON(data, 'merge');
    const state = board.state.get();
    expect(state.columns.map((c) => c.title)).toEqual([
      'A',
      'B',
      'C',
      'A',
      'B',
      'C',
      'A',
      'B',
      'C',
    ]);
    expect(state.board?.labels).toHaveLength(1);
    const all = [...state.cardsByColumn.values()].flat();
    expect(all).toHaveLength(3);
    expect(new Set(all.map((c) => c.id)).size).toBe(3);
    expect(all.every((c) => c.labelIds.includes(labelId))).toBe(true);
  });

  it('rejects data that is not a board export', async () => {
    const env = await makeEnv();
    const { board } = await seed(env);
    await expect(board.importJSON({ version: 2 }, 'replace')).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(board.importJSON(null, 'merge')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(board.state.get().columns).toHaveLength(3);
  });

  it('includes archived cards and keeps the columns and cards in rank order', async () => {
    const env = await makeEnv();
    const { board, ids } = await seed(env, ['b', 'a']);
    await board.moveCard(ids.a as string, ids.A as string, 0);
    await board.archiveCard(ids.b as string);
    const data = board.exportJSON();
    expect(data.version).toBe(1);
    expect(data.cards.map((c) => c.title)).toEqual(['a', 'b']);
    expect(data.cards.find((c) => c.title === 'b')?.archived).toBe(true);
  });
});
