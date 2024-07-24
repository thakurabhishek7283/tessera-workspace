import { describe, expect, it } from 'vitest';
import { makeEnv, seed, titles, until } from './helpers.js';

describe('concurrent writers (two controllers on one store)', () => {
  it('merges a stale edit with a newer one instead of overwriting it', async () => {
    const env = await makeEnv({ sync: 'none' });
    const { board: a, ids } = await seed(env, ['task']);
    const b = await env.api.open(a.boardId);
    const id = ids.task as string;

    await b.updateCard(id, { title: 'renamed by b' });
    // `a` still holds the old version; its write collides and is re-applied on top of b's.
    await a.updateCard(id, { dueDate: '2026-04-01' });

    const merged = a.state.get().cardsByColumn.get(ids.A as string)?.[0];
    expect(merged).toMatchObject({ title: 'renamed by b', dueDate: '2026-04-01' });
    expect(
      env.events.some(
        (e) =>
          e.type === 'kanban:conflict' &&
          (e.payload as { resolution: string }).resolution === 'reapplied',
      ),
    ).toBe(true);
    const fresh = await env.api.open(a.boardId);
    expect(fresh.state.get().cardsByColumn.get(ids.A as string)?.[0]).toMatchObject({
      title: 'renamed by b',
      dueDate: '2026-04-01',
    });
  });

  it('moves a card that someone else renamed in the meantime and keeps both', async () => {
    const env = await makeEnv({ sync: 'none' });
    const { board: a, ids } = await seed(env, ['1', '2']);
    const b = await env.api.open(a.boardId);
    await b.updateCard(ids['1'] as string, { title: 'one!' });
    await a.moveCard(ids['1'] as string, ids.B as string, 0);
    expect(titles(a, ids.B as string)).toEqual(['one!']);
  });

  it('drops an edit to a card that was deleted elsewhere and says so', async () => {
    const env = await makeEnv({ sync: 'none' });
    const { board: a, ids } = await seed(env, ['gone']);
    const b = await env.api.open(a.boardId);
    await b.deleteCard(ids.gone as string);
    await expect(a.updateCard(ids.gone as string, { title: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(titles(a, ids.A as string)).toEqual([]);
    expect(env.events.at(-1)).toMatchObject({
      type: 'kanban:conflict',
      payload: { resolution: 'dropped' },
    });
  });

  it('can still delete a card that someone else changed', async () => {
    const env = await makeEnv({ sync: 'none' });
    const { board: a, ids } = await seed(env, ['x']);
    const b = await env.api.open(a.boardId);
    await b.updateCard(ids.x as string, { title: 'y' });
    await a.deleteCard(ids.x as string);
    expect(titles(await env.api.open(a.boardId), ids.A as string)).toEqual([]);
  });

  it('reverts and reports when a card keeps changing underneath', async () => {
    const env = await makeEnv({ sync: 'none' });
    const { board: a, ids } = await seed(env, ['x']);
    const storage = env.instance.ctx.storage();
    const realPut = storage.put.bind(storage);
    let n = 0;
    storage.put = (async (
      collection: string,
      doc: { id: string; data: unknown; version?: number },
    ) => {
      // Someone else bumps the version just before each write of ours.
      if (collection === 'kanban.cards' && doc.id === ids.x && doc.version !== 0) {
        const current = await storage.get<Record<string, unknown>>(collection, doc.id);
        await realPut(collection, { id: doc.id, data: { ...current?.data, rank: `a${n++}` } });
      }
      return realPut(collection, doc);
    }) as typeof storage.put;
    await expect(a.updateCard(ids.x as string, { title: 'nope' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(titles(a, ids.A as string)).toEqual(['x']);
    expect(env.events.at(-1)).toMatchObject({ payload: { resolution: 'reverted' } });
  });
});

describe('live sync', () => {
  it('shows changes made through another controller', async () => {
    const env = await makeEnv({ sync: 'live' });
    const { board: a, ids } = await seed(env, ['1', '2']);
    const b = await env.api.open(a.boardId);
    await b.moveCard(ids['2'] as string, ids.B as string, 0);
    await until(() => titles(a, ids.B as string).length === 1);
    await b.updateCard(ids['1'] as string, { title: 'one' });
    await until(() => titles(a, ids.A as string).includes('one'));
    await b.addCard(ids.C as string, { title: 'new' });
    await until(() => titles(a, ids.C as string).length === 1);
    await b.deleteCard(ids['1'] as string);
    await until(() => titles(a, ids.A as string).length === 0);
    await b.addColumn('D');
    await until(() => a.state.get().columns.length === 4);
    await b.renameBoard('Shared');
    await until(() => a.state.get().board?.title === 'Shared');
  });

  it('ignores changes to other boards', async () => {
    const env = await makeEnv({ sync: 'live' });
    const { board: a } = await seed(env, ['mine']);
    const other = await env.api.open(
      (await env.api.createBoard({ title: 'Other', columns: ['X'] })).id,
    );
    await other.addCard(other.state.get().columns[0]?.id as string, { title: 'theirs' });
    await new Promise((r) => setTimeout(r, 30));
    const all = [...a.state.get().cardsByColumn.values()].flat().map((c) => c.title);
    expect(all).toEqual(['mine']);
  });

  it('does nothing when sync is none', async () => {
    const env = await makeEnv({ sync: 'none' });
    const { board: a, ids } = await seed(env, ['1']);
    const b = await env.api.open(a.boardId);
    await b.addCard(ids.A as string, { title: 'extra' });
    await new Promise((r) => setTimeout(r, 30));
    expect(titles(a, ids.A as string)).toEqual(['1']);
  });

  it('stops listening after close', async () => {
    const env = await makeEnv({ sync: 'live' });
    const { board: a, ids } = await seed(env, ['1']);
    const b = await env.api.open(a.boardId);
    a.close();
    await b.addCard(ids.A as string, { title: 'later' });
    await new Promise((r) => setTimeout(r, 30));
    expect(titles(a, ids.A as string)).toEqual(['1']);
  });

  it('does not double-apply its own writes', async () => {
    const env = await makeEnv({ sync: 'live' });
    const { board, ids } = await seed(env, ['1', '2', '3']);
    await board.moveCard(ids['3'] as string, ids.A as string, 0);
    await new Promise((r) => setTimeout(r, 30));
    expect(titles(board, ids.A as string)).toEqual(['3', '1', '2']);
  });

  it('closing the instance closes open boards', async () => {
    const env = await makeEnv();
    const { board } = await seed(env, ['1']);
    await env.instance.disable('kanban');
    expect(board.history.state.get().canUndo).toBe(false);
  });
});
