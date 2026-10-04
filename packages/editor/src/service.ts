import type { TesseraContext } from '@tessera-kit/core';
import type { EditorConfigValue } from './config.js';
import { renderStatic } from './render.js';
import { toPlainText } from './rich-doc.js';
import type { EditorService } from './types.js';

/** The `editor` service: creating editors loads Tiptap on first use. */
export function createEditorService(ctx: TesseraContext, config: EditorConfigValue): EditorService {
  return {
    async create(el, opts = {}) {
      const { createEditorEngine } = await import('./engine/index.js');
      return createEditorEngine({ ctx, config, el, opts });
    },
    renderStatic: (doc) => renderStatic(doc, { protocols: config.links.protocols }),
    toPlainText,
  };
}
