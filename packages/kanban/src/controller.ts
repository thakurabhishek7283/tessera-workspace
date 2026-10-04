import {
  type Command,
  createHistory,
  createStore,
  type ReadonlyStore,
  type Store,
  type TesseraContext,
  TesseraError,
} from '@tessera-kit/core';
import { type Collection, createCollection } from '@tessera-kit/storage';
import { createPersistence, type Kind } from '@tessera-internal/persist';
import { generateNKeysBetween } from 'fractional-indexing';
import type { KanbanConfigValue } from './config.js';
import { EMPTY_FILTER, matchesFilter } from './filter.js';
import { evenRanks, MAX_RANK_LENGTH, rankBetween } from './ranks.js';
import {
  type Board,
  BoardExportSchema,
  BoardSchema,
  type Card,
  CardSchema,
  type Column,
  ColumnSchema,
  type Label,
  type TokenColor,
} from './schemas.js';
import type { BoardController, BoardState, KanbanRuntime } from './types.js';

export interface Collections {
  boards: Collection<Board>;
  columns: Collection<Column>;
  cards: Collection<Card>;
}

export function createCollections(ctx: TesseraContext): Collections {
  return {
    boards: createCollection(ctx, 'kanban.boards', BoardSchema),
    columns: createCollection(ctx, 'kanban.columns', ColumnSchema),
    cards: createCollection(ctx, 'kanban.cards', CardSchema),
  };
}

const byRank = <T extends { rank: string; id: string }>(a: T, b: T): number =>
  a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id < b.id ? -1 : 1;

const PAGE = 500;

interface Options {
  ctx: TesseraContext;
  config: KanbanConfigValue;
  collections: Collections;
  runtime: ReadonlyStore<KanbanRuntime>;
  boardId: string;
}

/** Everything one open board can do. Created by {@link KanbanApi.open}. */
export async function createBoardController(opts: Options): Promise<BoardController> {
  const { ctx, config, collections, boardId } = opts;
  const history = createHistory({ clock: ctx.clock });
  const state: Store<BoardState> = createStore<BoardState>({
    board: null,
    columns: [],
    cardsByColumn: new Map(),
    cardCounts: new Map(),
    filter: EMPTY_FILTER,
    loading: true,
    error: null,
  });

  const boards = new Map<string, Board>();
  const columns = new Map<string, Column>();
  const cards = new Map<string, Card>();
  const persistence = createPersistence({
    logger: ctx.logger,
    onChange: () => recompute(),
    onConflict: (event) => ctx.bus.emit('kanban:conflict', event),
  });
  const { commit, insert, remove } = persistence;
  const kinds = {
    boards: persistence.kind(collections.boards, BoardSchema, boards),
    columns: persistence.kind(collections.columns, ColumnSchema, columns),
    cards: persistence.kind(collections.cards, CardSchema, cards),
  };
  const now = (): string => new Date(ctx.clock.now()).toISOString();

  // ---------- derived state ----------
  const recompute = (): void => {
    const clockNow = ctx.clock.now();
    const filter = state.get().filter;
    const cardsByColumn = new Map<string, Card[]>();
    const cardCounts = new Map<string, number>();
    for (const card of cards.values()) {
      if (card.archived) continue;
      cardCounts.set(card.columnId, (cardCounts.get(card.columnId) ?? 0) + 1);
      if (!matchesFilter(card, filter, clockNow)) continue;
      const list = cardsByColumn.get(card.columnId);
      if (list) list.push(card);
      else cardsByColumn.set(card.columnId, [card]);
    }
    for (const list of cardsByColumn.values()) list.sort(byRank);
    state.set((prev) => ({
      ...prev,
      board: boards.get(boardId) ?? null,
      columns: [...columns.values()].sort(byRank),
      cardsByColumn,
      cardCounts,
    }));
  };

  /** Every non-archived card of a column in rank order, ignoring the filter. */
  const columnCards = (columnId: string): Card[] =>
    [...cards.values()].filter((c) => c.columnId === columnId && !c.archived).sort(byRank);

  // ---------- persistence ----------
  /** Writes `patch` over a stored document; keys set to `undefined` are removed. */
  const patchOf = <T extends object>(current: T, patch: Partial<T>): T => {
    const next = { ...current, ...patch, updatedAt: now() } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
    if (!('updatedAt' in current)) delete next.updatedAt;
    return next as T;
  };

  /** Previous values of the fields `patch` touches, so the same call can be undone. */
  const inverseOf = <T extends object>(current: T, patch: Partial<T>): Partial<T> => {
    const back: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) back[k] = (current as Record<string, unknown>)[k];
    return back as Partial<T>;
  };

  const updateEntity = <T extends { id: string }>(
    kind: Kind<T>,
    id: string,
    patch: Partial<T>,
  ): Promise<T> => commit(kind, id, (current) => patchOf(current, patch));

  // ---------- guards ----------
  const allow = (capability: keyof KanbanConfigValue['allow']): void => {
    if (!config.allow[capability]) {
      throw new TesseraError('FORBIDDEN', `"${capability}" is turned off in the kanban config`);
    }
  };
  const column = (id: string): Column => {
    const found = columns.get(id);
    if (!found) throw new TesseraError('NOT_FOUND', `Column ${id} does not exist`);
    return found;
  };
  const card = (id: string): Card => {
    const found = cards.get(id);
    if (!found) throw new TesseraError('NOT_FOUND', `Card ${id} does not exist`);
    return found;
  };

  // ---------- ranks ----------
  /** Rewrites the ranks of a list as even keys. Changes no visible order, so it is not undoable. */
  const rebalanceCards = async (columnId: string): Promise<void> => {
    const list = columnCards(columnId);
    const keys = evenRanks(list.length);
    for (const [i, c] of list.entries()) {
      await updateEntity(kinds.cards, c.id, { rank: keys[i] as string });
    }
  };
  const rebalanceColumns = async (): Promise<void> => {
    const list = [...columns.values()].sort(byRank);
    const keys = evenRanks(list.length);
    for (const [i, c] of list.entries()) {
      await updateEntity(kinds.columns, c.id, { rank: keys[i] as string });
    }
  };
  const needsRebalance = (ranks: Iterable<string>): boolean => {
    for (const r of ranks) if (r.length > MAX_RANK_LENGTH) return true;
    return false;
  };

  /** Where in the full (unfiltered) list a card dropped at visible index `toIndex` belongs. */
  const fullIndex = (full: Card[], visible: Card[], toIndex: number): number => {
    const at = Math.min(Math.max(toIndex, 0), visible.length);
    const next = visible[at];
    if (next) return full.findIndex((c) => c.id === next.id);
    const prev = visible[at - 1];
    if (prev) return full.findIndex((c) => c.id === prev.id) + 1;
    return full.length;
  };

  const planCardRank = async (
    cardId: string,
    columnId: string,
    toIndex: number,
  ): Promise<string> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const full = columnCards(columnId).filter((c) => c.id !== cardId);
      const visible = (state.get().cardsByColumn.get(columnId) ?? []).filter(
        (c) => c.id !== cardId,
      );
      const at = fullIndex(full, visible, toIndex);
      const rank = rankBetween(full[at - 1]?.rank ?? null, full[at]?.rank ?? null);
      if (rank !== null) return rank;
      await rebalanceCards(columnId);
    }
    throw new TesseraError('UNKNOWN', 'Could not find a position for the card');
  };

  const planColumnRank = async (columnId: string | null, toIndex: number): Promise<string> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const list = [...columns.values()].filter((c) => c.id !== columnId).sort(byRank);
      const at = Math.min(Math.max(toIndex, 0), list.length);
      const rank = rankBetween(list[at - 1]?.rank ?? null, list[at]?.rank ?? null);
      if (rank !== null) return rank;
      await rebalanceColumns();
    }
    throw new TesseraError('UNKNOWN', 'Could not find a position for the column');
  };

  // ---------- load ----------
  const loadAll = async <T extends { id: string }>(kind: Kind<T>): Promise<void> => {
    let cursor: string | undefined;
    do {
      const page = await kind.coll.list({
        where: { boardId },
        limit: PAGE,
        ...(cursor ? { cursor } : {}),
      });
      for (const doc of page.items) persistence.adopt(kind, doc);
      cursor = page.nextCursor;
    } while (cursor);
  };

  try {
    const boardDoc = await collections.boards.get(boardId);
    if (!boardDoc) throw new TesseraError('NOT_FOUND', `Board ${boardId} does not exist`);
    persistence.adopt(kinds.boards, boardDoc);
    await Promise.all([loadAll(kinds.columns), loadAll(kinds.cards)]);
    state.set((prev) => ({ ...prev, loading: false, error: null }));
    recompute();
  } catch (error) {
    state.set((prev) => ({ ...prev, loading: false, error: TesseraError.from(error) }));
    throw error;
  }

  // ---------- live sync ----------
  if (config.sync === 'live') {
    persistence.follow(kinds.boards, (id) => id === boardId);
    persistence.follow(kinds.columns, (_id, data) => data.boardId === boardId);
    persistence.follow(kinds.cards, (_id, data) => data.boardId === boardId);
  }

  // ---------- commands ----------
  const run = (cmd: Command): Promise<void> => history.push(cmd);

  /** Patches an entity and returns a command-style pair for do/undo with merge support. */
  const patchCommand = <T extends { id: string }>(
    kind: Kind<T>,
    id: string,
    patch: Partial<T>,
    label: string,
    after?: (entity: T, patch: Partial<T>) => void,
  ): Command => {
    const before = inverseOf(kind.map.get(id) as T, patch);
    const mergeKey = `${kind.name}:${id}:${Object.keys(patch).sort().join(',')}`;
    const apply = async (p: Partial<T>): Promise<void> => {
      const saved = await updateEntity(kind, id, p);
      after?.(saved, p);
    };
    return {
      label,
      mergeKey,
      do: () => apply(patch),
      undo: () => apply(before),
      // `this` is the command already on the stack, so a chain of merges keeps the first undo.
      merge(next) {
        return { ...next, undo: this.undo };
      },
    };
  };

  const gate = (reason: 'wip' | 'vetoed', moved: Card, toColumnId: string): false => {
    ctx.bus.emit('kanban:move-blocked', { card: moved, toColumnId, reason });
    return false;
  };

  const controller: BoardController = {
    boardId,
    state,
    history,
    getCard: (id) => cards.get(id),
    getColumn: (id) => columns.get(id),

    // ----- columns -----
    async addColumn(title, at) {
      allow('createColumn');
      const index = at ?? columns.size;
      const rank = await planColumnRank(null, index);
      const created: Column = ColumnSchema.parse({ id: ctx.ids.next(), boardId, title, rank });
      await run({
        label: 'kanban.cmd.addColumn',
        do: async () => {
          await insert(kinds.columns, created);
          ctx.bus.emit('kanban:column-created', created);
        },
        undo: () => remove(kinds.columns, created.id),
      });
      return created;
    },

    async renameColumn(id, title) {
      allow('renameColumn');
      column(id);
      await run(
        patchCommand(kinds.columns, id, { title }, 'kanban.cmd.renameColumn', (entity, patch) =>
          ctx.bus.emit('kanban:column-updated', { column: entity, patch }),
        ),
      );
    },

    async setWipLimit(id, limit) {
      allow('renameColumn');
      column(id);
      await run(
        patchCommand(
          kinds.columns,
          id,
          { wipLimit: limit ?? undefined },
          'kanban.cmd.setWipLimit',
          (entity, patch) => ctx.bus.emit('kanban:column-updated', { column: entity, patch }),
        ),
      );
    },

    async updateColumn(id, patch) {
      allow('renameColumn');
      column(id);
      await run(
        patchCommand(kinds.columns, id, patch, 'kanban.cmd.updateColumn', (entity, p) =>
          ctx.bus.emit('kanban:column-updated', { column: entity, patch: p }),
        ),
      );
    },

    async moveColumn(id, toIndex) {
      allow('reorderColumns');
      const moving = column(id);
      const order = [...columns.values()].sort(byRank);
      const fromIndex = order.findIndex((c) => c.id === id);
      const rank = await planColumnRank(id, toIndex);
      const oldRank = moving.rank;
      const finalIndex = Math.min(Math.max(toIndex, 0), order.length - 1);
      if (finalIndex === fromIndex) return;
      const apply = async (to: string, from: number, into: number): Promise<void> => {
        const saved = await updateEntity(kinds.columns, id, { rank: to });
        ctx.bus.emit('kanban:column-moved', { column: saved, fromIndex: from, toIndex: into });
      };
      await run({
        label: 'kanban.cmd.moveColumn',
        do: () => apply(rank, fromIndex, finalIndex),
        undo: () => apply(oldRank, finalIndex, fromIndex),
      });
      if (needsRebalance([rank])) await rebalanceColumns();
    },

    async deleteColumn(id, options = {}) {
      allow('deleteColumn');
      const target = column(id);
      const { moveCardsTo } = options;
      if (moveCardsTo === id)
        throw new TesseraError('VALIDATION', 'Cannot move cards into the column being deleted');
      if (moveCardsTo) column(moveCardsTo);
      const own = [...cards.values()].filter((c) => c.columnId === id).sort(byRank);
      const snapshots = own.map((c) => ({ ...c }));
      const destination = moveCardsTo
        ? [...cards.values()].filter((c) => c.columnId === moveCardsTo && !c.archived).sort(byRank)
        : [];
      const newRanks = moveCardsTo
        ? generateNKeysBetween(destination.at(-1)?.rank ?? null, null, own.length)
        : [];
      await run({
        label: 'kanban.cmd.deleteColumn',
        do: async () => {
          if (moveCardsTo) {
            for (const [i, c] of own.entries()) {
              await updateEntity(kinds.cards, c.id, {
                columnId: moveCardsTo,
                rank: newRanks[i] as string,
              });
            }
          } else {
            for (const c of own) await remove(kinds.cards, c.id);
          }
          await remove(kinds.columns, id);
          ctx.bus.emit('kanban:column-deleted', target);
        },
        undo: async () => {
          await insert(kinds.columns, target);
          for (const snap of snapshots) {
            if (moveCardsTo)
              await updateEntity(kinds.cards, snap.id, {
                columnId: snap.columnId,
                rank: snap.rank,
              });
            else await insert(kinds.cards, snap);
          }
        },
      });
    },

    // ----- cards -----
    async addCard(columnId, input, at = 'bottom') {
      allow('createCard');
      const col = column(columnId);
      if (
        config.wipLimits &&
        col.wipLimit !== undefined &&
        (state.get().cardCounts.get(columnId) ?? 0) >= col.wipLimit
      ) {
        const probe = CardSchema.parse({
          ...input,
          id: 'probe',
          boardId,
          columnId,
          rank: 'a0',
          createdAt: now(),
          updatedAt: now(),
        });
        gate('wip', probe, columnId);
        throw new TesseraError('FORBIDDEN', `"${col.title}" is at its limit of ${col.wipLimit}`);
      }
      const list = columnCards(columnId);
      let rank =
        at === 'top'
          ? rankBetween(null, list[0]?.rank ?? null)
          : rankBetween(list.at(-1)?.rank ?? null, null);
      if (rank === null) {
        await rebalanceCards(columnId);
        const fresh = columnCards(columnId);
        rank =
          at === 'top'
            ? rankBetween(null, fresh[0]?.rank ?? null)
            : rankBetween(fresh.at(-1)?.rank ?? null, null);
      }
      const createdBy = ctx.auth.getUser()?.id;
      const created: Card = CardSchema.parse({
        ...input,
        id: ctx.ids.next(),
        boardId,
        columnId,
        rank,
        createdAt: now(),
        updatedAt: now(),
        ...(createdBy ? { createdBy } : {}),
      });
      await run({
        label: 'kanban.cmd.addCard',
        do: async () => {
          await insert(kinds.cards, created);
          ctx.bus.emit('kanban:card-created', created);
        },
        undo: () => remove(kinds.cards, created.id),
      });
      return created;
    },

    async updateCard(id, patch) {
      card(id);
      await run(
        patchCommand(
          kinds.cards,
          id,
          patch as Partial<Card>,
          'kanban.cmd.updateCard',
          (entity, p) => ctx.bus.emit('kanban:card-updated', { card: entity, patch: p }),
        ),
      );
    },

    async moveCard(id, toColumnId, toIndex) {
      allow('moveCard');
      const moving = card(id);
      const dest = column(toColumnId);
      const fromColumnId = moving.columnId;
      const fromList = columnCards(fromColumnId);
      const fromIndex = fromList.findIndex((c) => c.id === id);
      const sameColumn = fromColumnId === toColumnId;
      if (
        !sameColumn &&
        config.wipLimits &&
        dest.wipLimit !== undefined &&
        (state.get().cardCounts.get(toColumnId) ?? 0) >= dest.wipLimit
      ) {
        return gate('wip', moving, toColumnId);
      }
      const hook = opts.runtime.get().beforeCardMove;
      if (hook && !(await hook(moving, toColumnId))) return gate('vetoed', moving, toColumnId);

      const rank = await planCardRank(id, toColumnId, toIndex);
      const oldRank = moving.rank;
      const full = columnCards(toColumnId).filter((c) => c.id !== id);
      const toFinal = [...full, { ...moving, rank }].sort(byRank).findIndex((c) => c.id === id);
      if (sameColumn && toFinal === fromIndex) return true;

      const apply = async (
        columnId: string,
        nextRank: string,
        from: number,
        into: number,
        fromCol: string,
      ): Promise<void> => {
        const saved = await updateEntity(kinds.cards, id, { columnId, rank: nextRank });
        ctx.bus.emit('kanban:card-moved', {
          card: saved,
          fromColumnId: fromCol,
          toColumnId: columnId,
          fromIndex: from,
          toIndex: into,
        });
      };
      await run({
        label: 'kanban.cmd.moveCard',
        do: () => apply(toColumnId, rank, fromIndex, toFinal, fromColumnId),
        undo: () => apply(fromColumnId, oldRank, toFinal, fromIndex, toColumnId),
      });
      if (needsRebalance([rank])) await rebalanceCards(toColumnId);
      return true;
    },

    async deleteCard(id) {
      allow('deleteCard');
      const snapshot = { ...card(id) };
      await run({
        label: 'kanban.cmd.deleteCard',
        do: async () => {
          await remove(kinds.cards, id);
          ctx.bus.emit('kanban:card-deleted', snapshot);
        },
        undo: async () => {
          await insert(kinds.cards, snapshot);
        },
      });
    },

    async archiveCard(id) {
      card(id);
      await run(
        patchCommand(kinds.cards, id, { archived: true }, 'kanban.cmd.archiveCard', (entity, p) =>
          ctx.bus.emit('kanban:card-updated', { card: entity, patch: p }),
        ),
      );
    },

    // ----- labels and board -----
    async addLabel(input) {
      const created: Label = { id: ctx.ids.next(), name: input.name.trim(), color: input.color };
      const board = boards.get(boardId) as Board;
      await run(
        patchCommand(
          kinds.boards,
          boardId,
          { labels: [...board.labels, created] },
          'kanban.cmd.addLabel',
        ),
      );
      return created;
    },

    async updateLabel(id, patch) {
      const board = boards.get(boardId) as Board;
      if (!board.labels.some((l) => l.id === id))
        throw new TesseraError('NOT_FOUND', `Label ${id} does not exist`);
      const labels = board.labels.map((l) => (l.id === id ? { ...l, ...patch } : l));
      await run(patchCommand(kinds.boards, boardId, { labels }, 'kanban.cmd.updateLabel'));
    },

    async deleteLabel(id) {
      const board = boards.get(boardId) as Board;
      const labels = board.labels.filter((l) => l.id !== id);
      const users = [...cards.values()].filter((c) => c.labelIds.includes(id));
      await history.transaction('kanban.cmd.deleteLabel', async () => {
        await run(patchCommand(kinds.boards, boardId, { labels }, 'kanban.cmd.deleteLabel'));
        for (const c of users) {
          await run(
            patchCommand(
              kinds.cards,
              c.id,
              { labelIds: c.labelIds.filter((l) => l !== id) },
              'kanban.cmd.deleteLabel',
            ),
          );
        }
      });
    },

    async renameBoard(title) {
      await run(patchCommand(kinds.boards, boardId, { title }, 'kanban.cmd.renameBoard'));
    },

    // ----- view -----
    setFilter(next) {
      state.set((prev) => ({ ...prev, filter: { ...prev.filter, ...next } }));
      recompute();
    },

    // ----- import / export -----
    exportJSON() {
      return {
        version: 1,
        board: boards.get(boardId) as Board,
        columns: [...columns.values()].sort(byRank),
        cards: [...cards.values()].sort(byRank),
      };
    },

    async importJSON(input, mode) {
      const parsed = BoardExportSchema.safeParse(input);
      if (!parsed.success) {
        throw new TesseraError(
          'VALIDATION',
          `Not a board export: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
          {
            details: parsed.error.issues,
          },
        );
      }
      const data = parsed.data;
      history.clear();
      const board = boards.get(boardId) as Board;
      const labelMap = new Map<string, string>();
      let labels: Label[];

      if (mode === 'replace') {
        for (const c of [...cards.values()]) await remove(kinds.cards, c.id);
        for (const c of [...columns.values()]) await remove(kinds.columns, c.id);
        labels = data.board.labels;
        for (const l of labels) labelMap.set(l.id, l.id);
        await updateEntity(kinds.boards, boardId, {
          title: data.board.title,
          labels,
          description: data.board.description,
        });
      } else {
        // Merge: labels with the same name are shared instead of duplicated.
        labels = [...board.labels];
        for (const l of data.board.labels) {
          const same = labels.find((x) => x.name.toLowerCase() === l.name.toLowerCase());
          if (same) labelMap.set(l.id, same.id);
          else {
            const created = { ...l, id: ctx.ids.next() };
            labels.push(created);
            labelMap.set(l.id, created.id);
          }
        }
        if (labels.length !== board.labels.length)
          await updateEntity(kinds.boards, boardId, { labels });
      }

      // Copies get fresh ids in both modes: ids from another board would collide in storage.
      const incoming = [...data.columns].sort(byRank);
      const last =
        mode === 'merge' ? ([...columns.values()].sort(byRank).at(-1)?.rank ?? null) : null;
      const appended = mode === 'merge' ? generateNKeysBetween(last, null, incoming.length) : [];
      const columnMap = new Map<string, string>();
      for (const [i, c] of incoming.entries()) {
        const created = { ...c, id: ctx.ids.next(), boardId, rank: appended[i] ?? c.rank };
        columnMap.set(c.id, created.id);
        await insert(kinds.columns, created);
      }
      for (const c of data.cards) {
        const columnId = columnMap.get(c.columnId);
        if (!columnId) continue;
        await insert(kinds.cards, {
          ...c,
          id: ctx.ids.next(),
          boardId,
          columnId,
          labelIds: c.labelIds
            .map((l) => labelMap.get(l))
            .filter((l): l is string => l !== undefined),
        });
      }
    },

    close() {
      persistence.close();
      history.clear();
    },
  };

  return controller;
}

export type { TokenColor };
