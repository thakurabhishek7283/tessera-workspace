import { definePlugin } from '@tessera/core';
import { createNotesApi } from './api.js';
import { NotesConfig } from './config.js';
import { de } from './i18n/de.js';
import { en } from './i18n/en.js';
import type { NotesApi } from './types.js';

const disposers = new WeakMap<NotesApi, () => void>();

/**
 * The `notes` feature. Notes are stored through the instance's storage adapter, so the same code
 * runs on memory, IndexedDB or a REST backend.
 *
 * @example
 * createTessera(cfg, { plugins: { notes: () => import('@tessera/notes') } });
 */
export const notesPlugin = definePlugin({
  id: 'notes',
  version: '0.1.0',
  configSchema: NotesConfig,
  requires: ['storage'],
  // Notes are edited with the editor when it is enabled.
  optional: ['editor'],
  messages: { en, de },
  setup(ctx, config): NotesApi {
    const api = createNotesApi(ctx, config);
    disposers.set(api, api.dispose);
    return api;
  },
  teardown(api) {
    disposers.get(api)?.();
  },
});

export default notesPlugin;
