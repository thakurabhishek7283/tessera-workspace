import type { TesseraEvents } from '@tessera-kit/core';
import { createTestInstance, type TestInstance } from '@tessera-kit/testing';
import type { BoardController, Card, KanbanApi } from '../src/index.js';

export interface Env extends TestInstance {
  api: KanbanApi;
  events: Array<{ type: string; payload: unknown }>;
}

export async function makeEnv(kanban: Record<string, unknown> = {}): Promise<Env> {
  const test = await createTestInstance(
    { appId: 'kanban-test', features: { kanban: { enabled: true, ...kanban } } },
    { kanban: () => import('../src/plugin.js') },
  );
  const api = test.instance.feature('kanban');
  if (!api) throw new Error('kanban did not start');
  const events: Env['events'] = [];
  for (const type of [
    'kanban:card-created',
    'kanban:card-updated',
    'kanban:card-moved',
    'kanban:card-deleted',
    'kanban:column-created',
    'kanban:column-updated',
    'kanban:column-moved',
    'kanban:column-deleted',
    'kanban:move-blocked',
    'kanban:conflict',
    'kanban:board-created',
  ] as const satisfies ReadonlyArray<keyof TesseraEvents>) {
    test.instance.on(type, (payload) => events.push({ type, payload }));
  }
  return { ...test, api, events };
}

/** A board with columns "A", "B", "C" and the given card titles in "A". */
export async function seed(
  env: Env,
  titles: string[] = [],
): Promise<{ board: BoardController; ids: Record<string, string> }> {
  const created = await env.api.createBoard({ title: 'Test', columns: ['A', 'B', 'C'] });
  const board = await env.api.open(created.id);
  const ids: Record<string, string> = {};
  for (const col of board.state.get().columns) ids[col.title] = col.id;
  for (const title of titles) {
    const card = await board.addCard(ids.A as string, { title });
    ids[title] = card.id;
  }
  return { board, ids };
}

export const titles = (board: BoardController, columnId: string): string[] =>
  (board.state.get().cardsByColumn.get(columnId) ?? []).map((c: Card) => c.title);

export async function until(fn: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('until(): timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}
