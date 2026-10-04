import type { TesseraContext } from '@tessera-kit/core';
import type { NotesConfigValue } from './config.js';
import { createNotesCollection, createNotesController } from './controller.js';
import type { NotesApi, NotesController } from './types.js';

/** The `notes` feature API: open a board of notes to read and change it. */
export function createNotesApi(
  ctx: TesseraContext,
  config: NotesConfigValue,
): NotesApi & { dispose(): void } {
  const collection = createNotesCollection(ctx);
  const open = new Set<NotesController>();
  return {
    config,
    async open(boardId = 'default') {
      const controller = await createNotesController({ ctx, config, collection, boardId });
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
