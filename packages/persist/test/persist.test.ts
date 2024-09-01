import { createCollection } from '@tessera/storage';
import { createTestInstance } from '@tessera/testing';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createPersistence } from '../src/index.js';

const Item = z.object({ id: z.string(), title: z.string().min(1), note: z.string().optional() });

async function setup() {
  const { instance } = await createTestInstance({ appId: 'persist', features: {} }, {});
  const coll = createCollection(instance.ctx, 'demo.items', Item);
  const onChange = vi.fn();
  const onConflict = vi.fn();
  const persistence = createPersistence({ logger: instance.ctx.logger, onChange, onConflict });
  const kind = persistence.kind(coll, Item);
  return { persistence, kind, coll, onChange, onConflict };
}

describe('createPersistence', () => {
  it('inserts, edits and removes through storage and the map', async () => {
    const { persistence, kind, coll } = await setup();
    await persistence.insert(kind, { id: 'a', title: 'one' });
    expect(kind.map.get('a')).toEqual({ id: 'a', title: 'one' });
    expect((await coll.get('a'))?.data.title).toBe('one');
    await persistence.commit(kind, 'a', (c) => ({ ...c, title: 'two' }));
    expect((await coll.get('a'))?.version).toBe(2);
    await persistence.remove(kind, 'a');
    expect(kind.map.has('a')).toBe(false);
    expect(await coll.get('a')).toBeNull();
  });

  it('validates before touching anything', async () => {
    const { persistence, kind, onChange } = await setup();
    await persistence.insert(kind, { id: 'a', title: 'one' });
    onChange.mockClear();
    await expect(
      persistence.commit(kind, 'a', (c) => ({ ...c, title: '' })),
    ).rejects.toBeInstanceOf(Error);
    expect(kind.map.get('a')?.title).toBe('one');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rolls an insert back when storage refuses it', async () => {
    const { persistence, kind, coll } = await setup();
    await coll.put({ id: 'dup', data: { id: 'dup', title: 'taken' } });
    await expect(persistence.insert(kind, { id: 'dup', title: 'mine' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(kind.map.has('dup')).toBe(false);
  });

  it('re-applies an edit on top of a newer stored copy', async () => {
    const { persistence, kind, coll, onConflict } = await setup();
    await persistence.insert(kind, { id: 'a', title: 'one' });
    // Another writer adds a note while our copy is stale.
    const current = await coll.get('a');
    await coll.put({
      id: 'a',
      data: { id: 'a', title: 'one', note: 'theirs' },
      version: current?.version ?? 0,
    });
    const saved = await persistence.commit(kind, 'a', (c) => ({ ...c, title: 'ours' }));
    expect(saved).toEqual({ id: 'a', title: 'ours', note: 'theirs' });
    expect(onConflict).toHaveBeenCalledWith({
      collection: 'demo.items',
      id: 'a',
      resolution: 'reapplied',
    });
  });

  it('drops an edit to a document someone deleted', async () => {
    const { persistence, kind, coll, onConflict } = await setup();
    await persistence.insert(kind, { id: 'a', title: 'one' });
    await coll.delete('a');
    await expect(
      persistence.commit(kind, 'a', (c) => ({ ...c, title: 'x' })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(kind.map.has('a')).toBe(false);
    expect(onConflict).toHaveBeenCalledWith(expect.objectContaining({ resolution: 'dropped' }));
  });

  it('follows remote changes the filter approves and ignores its own writes', async () => {
    const { persistence, kind, coll, onChange } = await setup();
    persistence.follow(kind, (_id, data) => data.title !== 'skip');
    await persistence.insert(kind, { id: 'mine', title: 'own' });
    await new Promise((r) => setTimeout(r, 10));
    const afterOwn = onChange.mock.calls.length;
    await coll.put({ id: 'r1', data: { id: 'r1', title: 'remote' } });
    await coll.put({ id: 'r2', data: { id: 'r2', title: 'skip' } });
    await new Promise((r) => setTimeout(r, 10));
    expect(kind.map.has('r1')).toBe(true);
    expect(kind.map.has('r2')).toBe(false);
    expect(onChange.mock.calls.length).toBeGreaterThan(afterOwn);
    await coll.delete('r1');
    await new Promise((r) => setTimeout(r, 10));
    expect(kind.map.has('r1')).toBe(false);
    persistence.close();
    await coll.put({ id: 'late', data: { id: 'late', title: 'after close' } });
    await new Promise((r) => setTimeout(r, 10));
    expect(kind.map.has('late')).toBe(false);
  });
});
