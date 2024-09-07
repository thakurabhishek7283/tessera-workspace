import { describe, expect, it } from 'vitest';
import { doc, makeEnv, texts, until } from './helpers.js';

describe('creating and editing', () => {
  it('creates a note with defaults and a cascading position', async () => {
    const env = await makeEnv();
    const board = await env.api.open();
    const a = await board.create({ content: doc('a') });
    const b = await board.create({ content: doc('b') });
    expect(a).toMatchObject({
      boardId: 'default',
      color: 'yellow',
      w: 240,
      h: 180,
      pinned: false,
      tags: [],
      createdBy: env.user.id,
    });
    expect([a.x, a.y]).toEqual([32, 32]);
    expect([b.x, b.y]).toEqual([56, 56]);
    expect(b.z).toBeGreaterThan(a.z);
  });

  it('honours default colour, allowed colours and a fallback when the default is not allowed', async () => {
    const env = await makeEnv({ colors: ['blue', 'green'], defaultColor: 'pink' });
    const board = await env.api.open();
    expect((await board.create()).color).toBe('blue');
    expect((await board.create({ color: 'green' })).color).toBe('green');
    // A colour that is not allowed falls back to the first allowed one.
    expect((await board.create({ color: 'red' as never })).color).toBe('blue');
    const note = await board.create({ color: 'yellow' });
    expect(note.color).toBe('blue');
    await expect(board.setColor(note.id, 'yellow')).rejects.toMatchObject({ code: 'VALIDATION' });
    await board.setColor(note.id, 'green');
    expect(board.getNote(note.id)?.color).toBe('green');
  });

  it('edits content and tags, merges quick edits into one undo step and keeps updatedAt moving', async () => {
    const env = await makeEnv();
    const board = await env.api.open();
    const note = await board.create({ content: doc('x') });
    env.clock.advance(1000);
    await board.update(note.id, { content: doc('xy') });
    await board.update(note.id, { content: doc('xyz') });
    expect(texts(board)).toEqual(['xyz']);
    expect(board.getNote(note.id)?.updatedAt).not.toBe(note.updatedAt);
    await board.history.undo();
    expect(texts(board)).toEqual(['x']);
    await board.update(note.id, { tags: [' work ', 'work', 'idea', ''] });
    expect(board.getNote(note.id)?.tags).toEqual(['work', 'idea']);
  });

  it('rejects invalid content and unknown notes', async () => {
    const env = await makeEnv();
    const board = await env.api.open();
    const note = await board.create();
    await expect(
      board.update(note.id, { content: { type: 'paragraph' } as never }),
    ).rejects.toBeInstanceOf(Error);
    await expect(board.update('nope', { pinned: true })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(board.getNote(note.id)?.content).toEqual(note.content);
  });

  it('moves and resizes with clamping, and merges a drag into one undo step', async () => {
    const env = await makeEnv();
    const board = await env.api.open();
    const note = await board.create({ x: 100, y: 100 });
    await board.move(note.id, 110, 120);
    await board.move(note.id, 140, 160);
    await board.move(note.id, -50, 10);
    expect(board.getNote(note.id)).toMatchObject({ x: 0, y: 10 });
    await board.resize(note.id, 50, 40);
    expect(board.getNote(note.id)).toMatchObject({ w: 160, h: 120 });
    await board.history.undo();
    expect(board.getNote(note.id)).toMatchObject({ w: 240, h: 180 });
    await board.history.undo();
    expect(board.getNote(note.id)).toMatchObject({ x: 100, y: 100 });
  });

  it('raises a note above the others without making an undo step', async () => {
    const env = await makeEnv();
    const board = await env.api.open();
    const a = await board.create();
    const b = await board.create();
    const before = board.history.state.get();
    board.bringToFront(a.id);
    await until(() => (board.getNote(a.id)?.z ?? 0) > (board.getNote(b.id)?.z ?? 0));
    expect(board.history.state.get()).toEqual(before);
    board.bringToFront(a.id);
    const z = board.getNote(a.id)?.z;
    await new Promise((r) => setTimeout(r, 10));
    expect(board.getNote(a.id)?.z).toBe(z);
  });
});

describe('pinning, archiving and deleting', () => {
  it('pins to the top of the grid and archives out of view', async () => {
    const env = await makeEnv();
    const board = await env.api.open();
    const a = await board.create({ content: doc('a') });
    env.clock.advance(1000);
    const b = await board.create({ content: doc('b') });
    env.clock.advance(1000);
    await board.create({ content: doc('c') });
    expect(texts(board)).toEqual(['c', 'b', 'a']);
    await board.togglePin(a.id);
    expect(texts(board)).toEqual(['a', 'c', 'b']);
    await board.togglePin(a.id);
    await board.archive(b.id);
    expect(texts(board)).toEqual(['a', 'c']);
    board.setShowArchived(true);
    expect(texts(board)).toEqual(['b']);
    await board.unarchive(b.id);
    expect(texts(board)).toEqual([]);
    board.setShowArchived(false);
    expect(texts(board).sort()).toEqual(['a', 'b', 'c']);
    expect(board.state.get().notes).toHaveLength(3);
  });

  it('deletes and restores with undo', async () => {
    const env = await makeEnv();
    const board = await env.api.open();
    const note = await board.create({ content: doc('keep me'), tags: ['t'], color: 'pink' });
    await board.delete(note.id);
    expect(texts(board)).toEqual([]);
    await board.history.undo();
    expect(board.getNote(note.id)).toMatchObject({ tags: ['t'], color: 'pink' });
    const again = await (await env.api.open()).state.get().notes;
    expect(again).toHaveLength(1);
  });

  it('refuses what the config turns off', async () => {
    const env = await makeEnv({ pinning: false, tags: false, archive: false });
    const board = await env.api.open();
    const note = await board.create({ pinned: true, tags: ['x'] });
    expect(note).toMatchObject({ pinned: false, tags: [] });
    await expect(board.togglePin(note.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(board.archive(note.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await board.update(note.id, { tags: ['y'] });
    expect(board.getNote(note.id)?.tags).toEqual([]);
  });
});

describe('searching and filtering', () => {
  it('searches text and tags ignoring case and accents', async () => {
    const env = await makeEnv();
    const board = await env.api.open();
    await board.create({ content: doc('Café menu') });
    await board.create({ content: doc('Groceries'), tags: ['Errands'] });
    await board.create({ content: doc('Plan') });
    board.setQuery('CAFE');
    expect(texts(board)).toEqual(['Café menu']);
    board.setQuery('errand');
    expect(texts(board)).toEqual(['Groceries']);
    board.setQuery('  ');
    expect(texts(board)).toHaveLength(3);
    board.setQuery('nothing');
    expect(texts(board)).toEqual([]);
  });

  it('filters by tag and lists tags by use', async () => {
    const env = await makeEnv();
    const board = await env.api.open();
    await board.create({ content: doc('1'), tags: ['a', 'b'] });
    await board.create({ content: doc('2'), tags: ['b'] });
    await board.create({ content: doc('3') });
    expect(board.state.get().tags).toEqual([
      { tag: 'b', count: 2 },
      { tag: 'a', count: 1 },
    ]);
    board.setTag('b');
    expect(board.state.get().visible).toHaveLength(2);
    board.setTag('a');
    expect(texts(board)).toEqual(['1']);
    board.setTag(undefined);
    expect(texts(board)).toHaveLength(3);
  });

  it('orders the free canvas by stacking order', async () => {
    const env = await makeEnv({ layout: 'free' });
    const board = await env.api.open();
    const a = await board.create({ content: doc('a') });
    await board.create({ content: doc('b') });
    expect(board.state.get().layout).toBe('free');
    board.bringToFront(a.id);
    await until(() => texts(board).join('') === 'ba');
    board.setLayout('grid');
    expect(board.state.get().layout).toBe('grid');
  });
});

describe('boards, sync and import', () => {
  it('keeps boards apart', async () => {
    const env = await makeEnv();
    const one = await env.api.open('one');
    const two = await env.api.open('two');
    await one.create({ content: doc('in one') });
    expect(texts(two)).toEqual([]);
    expect(texts(await env.api.open('one'))).toEqual(['in one']);
  });

  it('shows changes made through another controller, and stops after close', async () => {
    const env = await makeEnv();
    const a = await env.api.open();
    const b = await env.api.open();
    const note = await b.create({ content: doc('hello') });
    await until(() => texts(a).includes('hello'));
    await b.update(note.id, { content: doc('hello!') });
    await until(() => texts(a).includes('hello!'));
    await b.delete(note.id);
    await until(() => texts(a).length === 0);
    a.close();
    await b.create({ content: doc('later') });
    await new Promise((r) => setTimeout(r, 20));
    expect(texts(a)).toEqual([]);
  });

  it('merges a stale edit with a newer one', async () => {
    const env = await makeEnv({ sync: 'none' });
    const a = await env.api.open();
    const note = await a.create({ content: doc('x') });
    const b = await env.api.open();
    await b.setColor(note.id, 'blue');
    await a.update(note.id, { tags: ['t'] });
    expect(a.getNote(note.id)).toMatchObject({ color: 'blue', tags: ['t'] });
  });

  it('exports and imports copies', async () => {
    const env = await makeEnv();
    const a = await env.api.open('a');
    await a.create({ content: doc('one'), tags: ['t'] });
    await a.create({ content: doc('two'), color: 'pink' });
    const data = JSON.parse(JSON.stringify(a.exportJSON()));
    const b = await env.api.open('b');
    await b.importJSON(data);
    await b.importJSON(data);
    expect(b.state.get().notes).toHaveLength(4);
    expect(new Set(b.state.get().notes.map((n) => n.id)).size).toBe(4);
    expect(b.state.get().notes.every((n) => n.boardId === 'b')).toBe(true);
    await expect(b.importJSON({ nope: true })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
