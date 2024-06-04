import { definePlugin } from '@tessera/core';
import { EditorConfig } from './config.js';
import { en } from './i18n/en.js';
import { createEditorService } from './service.js';

/**
 * The `editor` feature. Setup is cheap: Tiptap is only imported when the first editor is created.
 *
 * @example
 * createTessera(cfg, { plugins: { editor: () => import('@tessera/editor') } });
 */
export const editorPlugin = definePlugin({
  id: 'editor',
  version: '0.1.0',
  configSchema: EditorConfig,
  messages: { en },
  setup: (ctx, config) => createEditorService(ctx, config),
});

export default editorPlugin;
