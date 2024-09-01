import { type Logger, TesseraError, type Unsubscribe } from '@tessera/core';
import type { Collection } from '@tessera/storage';
import type { z } from 'zod';

export interface Entity {
  id: string;
}

/** An in-memory map of documents of one storage collection, plus how to validate and save them. */
export interface Kind<T extends Entity> {
  readonly name: string;
  readonly coll: Collection<T>;
  readonly schema: z.ZodType<T>;
  readonly map: Map<string, T>;
}

export type Resolution = 'reapplied' | 'reverted' | 'dropped';

export interface PersistenceOptions {
  logger: Logger;
  /** Called after the maps changed (optimistic edits, reverts and remote changes). */
  onChange(): void;
  onConflict(event: { collection: string; id: string; resolution: Resolution }): void;
}

export interface Persistence {
  kind<T extends Entity>(coll: Collection<T>, schema: z.ZodType<T>, map?: Map<string, T>): Kind<T>;
  /** Records a document read from storage, so the next write knows its version. */
  adopt<T extends Entity>(kind: Kind<T>, doc: { id: string; data: T; version: number }): void;
  /**
   * Applies `mutate` to a stored document: optimistically in memory first, then in storage. When
   * another writer got there first, the stored copy is fetched and `mutate` runs again on it, so
   * two edits to different fields both survive.
   */
  commit<T extends Entity>(kind: Kind<T>, id: string, mutate: (current: T) => T): Promise<T>;
  insert<T extends Entity>(kind: Kind<T>, value: T): Promise<T>;
  remove<T extends Entity>(kind: Kind<T>, id: string): Promise<void>;
  /** Applies changes other writers make to `kind`, for documents `accepts` approves. */
  follow<T extends Entity>(kind: Kind<T>, accepts: (id: string, data: T) => boolean): Unsubscribe;
  close(): void;
}

const MAX_WRITE_ATTEMPTS = 3;

/** Shared write path of the kits that keep their documents in memory (kanban, notes). */
export function createPersistence(options: PersistenceOptions): Persistence {
  const versions = new Map<string, number>();
  const inFlight = new Map<string, number>();
  const stops: Unsubscribe[] = [];
  let closed = false;

  const keyOf = (kind: Kind<Entity>, id: string): string => `${kind.name}/${id}`;
  const bump = (key: string, delta: number): void => {
    const n = (inFlight.get(key) ?? 0) + delta;
    if (n <= 0) inFlight.delete(key);
    else inFlight.set(key, n);
  };

  const refetch = async <T extends Entity>(kind: Kind<T>, id: string): Promise<T | null> => {
    const doc = await kind.coll.get(id);
    if (!doc) {
      versions.delete(keyOf(kind, id));
      return null;
    }
    versions.set(keyOf(kind, id), doc.version);
    return doc.data;
  };

  const conflict = (kind: Kind<Entity>, id: string, resolution: Resolution): void =>
    options.onConflict({ collection: kind.coll.name, id, resolution });

  return {
    kind: (coll, schema, map = new Map()) => ({ name: coll.name, coll, schema, map }),

    adopt(kind, doc) {
      kind.map.set(doc.id, doc.data);
      versions.set(keyOf(kind, doc.id), doc.version);
    },

    async commit(kind, id, mutate) {
      const original = kind.map.get(id);
      if (!original) throw new TesseraError('NOT_FOUND', `${kind.name}/${id} does not exist`);
      const key = keyOf(kind, id);
      let base = original;
      let reapplied = false;
      for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
        const next = kind.schema.parse(mutate(base));
        kind.map.set(id, next);
        options.onChange();
        bump(key, 1);
        try {
          const saved = await kind.coll.put({ id, data: next, version: versions.get(key) ?? 0 });
          versions.set(key, saved.version);
          if (reapplied) conflict(kind, id, 'reapplied');
          return next;
        } catch (error) {
          if (!TesseraError.is(error, 'CONFLICT')) {
            kind.map.set(id, original);
            options.onChange();
            throw error;
          }
          const server = await refetch(kind, id);
          if (!server) {
            kind.map.delete(id);
            options.onChange();
            conflict(kind, id, 'dropped');
            throw new TesseraError('NOT_FOUND', `${kind.name}/${id} was deleted by someone else`);
          }
          base = server;
          reapplied = true;
        } finally {
          bump(key, -1);
        }
      }
      kind.map.set(id, base);
      options.onChange();
      conflict(kind, id, 'reverted');
      throw new TesseraError(
        'CONFLICT',
        `${kind.name}/${id} kept changing; the edit was not saved`,
      );
    },

    async insert(kind, value) {
      const data = kind.schema.parse(value);
      const key = keyOf(kind, data.id);
      kind.map.set(data.id, data);
      options.onChange();
      bump(key, 1);
      try {
        const saved = await kind.coll.put({ id: data.id, data, version: 0 });
        versions.set(key, saved.version);
        return data;
      } catch (error) {
        kind.map.delete(data.id);
        options.onChange();
        throw error;
      } finally {
        bump(key, -1);
      }
    },

    async remove(kind, id) {
      const original = kind.map.get(id);
      if (!original) return;
      const key = keyOf(kind, id);
      kind.map.delete(id);
      options.onChange();
      bump(key, 1);
      try {
        try {
          await kind.coll.delete(id, versions.get(key));
        } catch (error) {
          if (!TesseraError.is(error, 'CONFLICT')) throw error;
          // Someone changed it first; deleting the newer copy is still what the user asked for.
          await refetch(kind, id);
          await kind.coll.delete(id, versions.get(key));
        }
        versions.delete(key);
      } catch (error) {
        kind.map.set(id, original);
        options.onChange();
        throw error;
      } finally {
        bump(key, -1);
      }
    },

    follow(kind, accepts) {
      const stop = kind.coll.watch((change) => {
        if (closed) return;
        const key = keyOf(kind, change.id);
        // Our own writes announce themselves before they resolve; the optimistic copy is current.
        if (inFlight.has(key)) return;
        if (!change.deleted && change.version <= (versions.get(key) ?? 0)) return;
        void (async () => {
          if (change.deleted) {
            if (kind.map.delete(change.id)) {
              versions.delete(key);
              options.onChange();
            }
            return;
          }
          const data = await refetch(kind, change.id);
          if (closed || !data || !accepts(change.id, data)) return;
          kind.map.set(change.id, data);
          options.onChange();
        })().catch((error: unknown) =>
          options.logger.warn('could not apply a remote change', error),
        );
      });
      stops.push(stop);
      return stop;
    },

    close() {
      closed = true;
      for (const stop of stops.splice(0)) stop();
    },
  };
}
