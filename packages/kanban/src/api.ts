import { createStore, type TesseraContext, TesseraError } from '@tessera/core';
import type { KanbanConfigValue } from './config.js';
import { type Collections, createBoardController, createCollections } from './controller.js';
import { evenRanks } from './ranks.js';
import { type Board, BoardSchema, type Column, ColumnSchema } from './schemas.js';
import type { BoardController, KanbanApi, KanbanRuntime } from './types.js';

/** The `kanban` feature API: boards, and a controller for each board you open. */
export function createKanbanApi(
  ctx: TesseraContext,
  config: KanbanConfigValue,
): KanbanApi & {
  dispose(): void;
} {
  const collections: Collections = createCollections(ctx);
  const runtime = createStore<KanbanRuntime>({ members: [] });
  const open = new Set<BoardController>();

  return {
    config,
    runtime,

    configure(patch) {
      runtime.set((prev) => ({ ...prev, ...patch }));
    },

    async listBoards() {
      const found: Board[] = [];
      let cursor: string | undefined;
      do {
        const page = await collections.boards.list({
          orderBy: { field: 'createdAt' },
          limit: 100,
          ...(cursor ? { cursor } : {}),
        });
        found.push(...page.items.map((d) => d.data).filter((b) => !b.archived));
        cursor = page.nextCursor;
      } while (cursor);
      return found;
    },

    async createBoard(input) {
      if (!config.allow.createBoard) {
        throw new TesseraError('FORBIDDEN', '"createBoard" is turned off in the kanban config');
      }
      const stamp = new Date(ctx.clock.now()).toISOString();
      const board = BoardSchema.parse({
        id: ctx.ids.next(),
        title: input.title.trim(),
        labels: [],
        createdAt: stamp,
        updatedAt: stamp,
      });
      const titles = input.columns ?? config.defaultColumns;
      const ranks = evenRanks(titles.length);
      const made: Column[] = titles.map((title, i) =>
        ColumnSchema.parse({ id: ctx.ids.next(), boardId: board.id, title, rank: ranks[i] }),
      );
      await collections.boards.put({ id: board.id, data: board, version: 0 });
      await Promise.all(
        made.map((c) => collections.columns.put({ id: c.id, data: c, version: 0 })),
      );
      ctx.bus.emit('kanban:board-created', board);
      return board;
    },

    async open(boardId) {
      const controller = await createBoardController({
        ctx,
        config,
        collections,
        runtime,
        boardId,
      });
      open.add(controller);
      const close = controller.close.bind(controller);
      controller.close = () => {
        open.delete(controller);
        close();
      };
      return controller;
    },

    dispose() {
      for (const controller of [...open]) controller.close();
    },
  };
}
