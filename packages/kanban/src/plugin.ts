import { definePlugin } from '@tessera-kit/core';
import { createKanbanApi } from './api.js';
import { KanbanConfig } from './config.js';
import { de } from './i18n/de.js';
import { en } from './i18n/en.js';
import type { KanbanApi } from './types.js';

const disposers = new WeakMap<KanbanApi, () => void>();

/**
 * The `kanban` feature. Stores boards, columns and cards through the instance's storage adapter,
 * so the same code runs on memory, IndexedDB or a REST backend.
 *
 * @example
 * createTessera(cfg, { plugins: { kanban: () => import('@tessera-kit/kanban') } });
 */
export const kanbanPlugin = definePlugin({
  id: 'kanban',
  version: '0.1.0',
  configSchema: KanbanConfig,
  requires: ['storage'],
  // Card descriptions use the editor when it is enabled; a plain text box stands in otherwise.
  optional: ['editor'],
  messages: { en, de },
  setup(ctx, config): KanbanApi {
    const api = createKanbanApi(ctx, config);
    disposers.set(api, api.dispose);
    return api;
  },
  teardown(api) {
    disposers.get(api)?.();
  },
});

export default kanbanPlugin;
