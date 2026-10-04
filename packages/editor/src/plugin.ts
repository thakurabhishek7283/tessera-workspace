import { definePlugin } from '@tessera-kit/core';
import { EditorConfig } from './config.js';
import { de } from './i18n/de.js';
import { en } from './i18n/en.js';
import { createEditorService } from './service.js';

/**
 * The `editor` feature. Setup is cheap: Tiptap is only imported when the first editor is created.
 *
 * @example
 * createTessera(cfg, { plugins: { editor: () => import('@tessera-kit/editor') } });
 */
export const editorPlugin = definePlugin({
  id: 'editor',
  version: '0.1.0',
  configSchema: EditorConfig,
  messages: { en, de },
  setup: (ctx, config) => createEditorService(ctx, config),
});

export default editorPlugin;
