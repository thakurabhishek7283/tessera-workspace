import type { TesseraInstance, UserInfo } from '@tessera/core';
import '@tessera/elements/define';
import { deepQuery, mountInstance, must, until } from '@tessera-internal/test-utils';
import '../src/elements/index.js';
import type { TesseraKanbanElement } from '../src/elements/board.js';
import type { TesseraKanbanCard } from '../src/elements/card.js';
import type { TesseraKanbanColumn } from '../src/elements/column.js';
import { type BoardController, evenRanks, type KanbanApi } from '../src/index.js';

export const plugins = {
  kanban: () => import('../src/plugin.js'),
  editor: () => import('@tessera/editor'),
};

export const ada: UserInfo = { id: 'u-ada', name: 'Ada Lovelace' };
export const alan: UserInfo = { id: 'u-alan', name: 'Alan Turing' };

export interface Mounted {
  instance: TesseraInstance;
  api: KanbanApi;
  /** A controller on the same board, for seeding and for checking what was stored. */
  data: BoardController;
  el: TesseraKanbanElement;
  ids: Record<string, string>;
}

export interface MountOptions {
  kanban?: Record<string, unknown>;
  cards?: Record<string, string[]>;
  attrs?: Record<string, string>;
  /** Mount without a board attribute (shows the picker). */
  picker?: boolean;
  readonly?: boolean;
  members?: UserInfo[];
  style?: string;
}

export async function mount(opts: MountOptions = {}): Promise<Mounted> {
  const { instance, root } = await mountInstance(
    {
      appId: 'kanban-ui',
      features: { kanban: { enabled: true, ...opts.kanban }, editor: { enabled: true } },
    },
    plugins,
  );
  const api = instance.feature('kanban') as KanbanApi;
  // Seeded straight into storage, so tests can switch capabilities off without breaking the setup.
  const { ids, boardId } = await seedStorage(instance, opts.cards ?? {});
  const created = { id: boardId };
  const data = await api.open(created.id);
  const el = document.createElement('tessera-kanban') as TesseraKanbanElement;
  if (!opts.picker) el.setAttribute('board', created.id);
  for (const [k, v] of Object.entries(opts.attrs ?? {})) el.setAttribute(k, v);
  if (opts.readonly) el.readonly = true;
  if (opts.members) el.members = opts.members;
  if (opts.style) el.style.cssText = opts.style;
  root.append(el);
  if (!opts.picker) {
    await until(() => el.controller && el.shadowRoot?.querySelector('tessera-kanban-column'));
    await settleBoard(el);
  } else {
    await el.updateComplete;
  }
  return { instance, api, data, el, ids };
}

async function seedStorage(
  instance: TesseraInstance,
  cards: Record<string, string[]>,
): Promise<{ ids: Record<string, string>; boardId: string }> {
  const storage = instance.ctx.storage();
  const now = new Date(instance.ctx.clock.now()).toISOString();
  const ids: Record<string, string> = {};
  const boardId = instance.ctx.ids.next();
  await storage.put('kanban.boards', {
    id: boardId,
    data: { id: boardId, title: 'Roadmap', labels: [], createdAt: now, updatedAt: now },
  });
  const ranks = evenRanks(3);
  for (const [i, title] of ['A', 'B', 'C'].entries()) {
    const id = instance.ctx.ids.next();
    ids[title] = id;
    await storage.put('kanban.columns', { id, data: { id, boardId, title, rank: ranks[i] } });
  }
  for (const [column, titles] of Object.entries(cards)) {
    const cardRanks = evenRanks(titles.length);
    for (const [i, title] of titles.entries()) {
      const id = instance.ctx.ids.next();
      ids[title] = id;
      await storage.put('kanban.cards', {
        id,
        data: {
          id,
          boardId,
          columnId: ids[column],
          rank: cardRanks[i],
          title,
          labelIds: [],
          assigneeIds: [],
          checklist: [],
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  }
  return { ids, boardId };
}

export async function settleBoard(el: Element): Promise<void> {
  const wait = async (node: Element | ShadowRoot): Promise<void> => {
    for (const child of node.querySelectorAll('*')) {
      const u = (child as { updateComplete?: Promise<unknown> }).updateComplete;
      if (u) await u;
      if (child.shadowRoot) await wait(child.shadowRoot);
    }
  };
  await (el as { updateComplete?: Promise<unknown> }).updateComplete;
  if (el.shadowRoot) await wait(el.shadowRoot);
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
}

export const columns = (el: Element): TesseraKanbanColumn[] => [
  ...(el.shadowRoot?.querySelectorAll<TesseraKanbanColumn>('tessera-kanban-column') ?? []),
];

export const column = (el: Element, title: string): TesseraKanbanColumn =>
  must(
    columns(el).find((c) => c.column?.title === title),
    `column ${title}`,
  );

export const cardsIn = (el: Element, title: string): TesseraKanbanCard[] => [
  ...(column(el, title).renderRoot.querySelectorAll<TesseraKanbanCard>('tessera-kanban-card') ??
    []),
];

export const cardTitles = (el: Element, title: string): string[] =>
  cardsIn(el, title).map((c) => c.card?.title ?? '');

export const card = (el: Element, title: string): TesseraKanbanCard =>
  must(
    columns(el)
      .flatMap((c) => [...c.renderRoot.querySelectorAll<TesseraKanbanCard>('tessera-kanban-card')])
      .find((c) => c.card?.title === title),
    `card ${title}`,
  );

/** The `.cards` list of a column. */
export const list = (el: Element, title: string): HTMLElement =>
  must(column(el, title).list, 'list');

export const text = (el: Element | null | undefined): string =>
  el?.shadowRoot?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

export { deepQuery, must, until };

const pointerInit = (x: number, y: number, extra: PointerEventInit = {}): PointerEventInit => ({
  bubbles: true,
  composed: true,
  cancelable: true,
  clientX: x,
  clientY: y,
  pointerId: 1,
  pointerType: 'mouse',
  isPrimary: true,
  button: 0,
  ...extra,
});

export const centerOf = (el: Element): { x: number; y: number } => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

export const frames = async (n = 2): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(() => r(undefined)));
};

/** Drags `from` with synthetic pointer events and releases at `to` (viewport coordinates). */
export async function dragTo(from: Element, to: { x: number; y: number }): Promise<void> {
  const start = centerOf(from);
  from.dispatchEvent(new PointerEvent('pointerdown', pointerInit(start.x, start.y)));
  for (let i = 1; i <= 4; i++) {
    const x = start.x + ((to.x - start.x) * i) / 4;
    const y = start.y + ((to.y - start.y) * i) / 4;
    document.dispatchEvent(new PointerEvent('pointermove', pointerInit(x, y)));
    await frames(1);
  }
  await frames(2);
  document.dispatchEvent(new PointerEvent('pointerup', pointerInit(to.x, to.y)));
  await frames(3);
}
