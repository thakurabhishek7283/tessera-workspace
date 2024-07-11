import type { DndContainer, DndItem } from '../src/index.js';

export interface Board {
  host: HTMLElement;
  columns: Map<string, HTMLElement>;
  /** Item elements by id. */
  items: Map<string, HTMLElement>;
  containers: () => DndContainer[];
}

let counter = 0;

/**
 * A board of vertical lists inside a shadow root (so tests prove the sortable works across shadow
 * boundaries). Each item is 40px tall with a 10px gap; columns are 120px wide, 20px apart.
 */
export function createBoard(
  layout: Record<string, string[]>,
  opts: { handle?: boolean } = {},
): Board {
  const host = document.createElement('div');
  host.id = `board-${++counter}`;
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host { display: flex; gap: 20px; padding: 20px; }
    .col { width: 120px; min-height: 60px; display: flex; flex-direction: column; gap: 10px; background: #eee; }
    .item { height: 40px; background: #cde; display: flex; align-items: center; }
    .item[data-dragging] { opacity: 0.4; }
  </style>`;
  const columns = new Map<string, HTMLElement>();
  const items = new Map<string, HTMLElement>();
  for (const [id, ids] of Object.entries(layout)) {
    const col = document.createElement('div');
    col.className = 'col';
    col.dataset.id = id;
    for (const itemId of ids) {
      const item = document.createElement('div');
      item.className = 'item';
      item.dataset.id = itemId;
      item.tabIndex = 0;
      item.setAttribute('aria-label', itemId);
      item.innerHTML = `${opts.handle ? '<span class="grip" style="width:20px;height:20px">⠿</span>' : ''}<span>${itemId}</span><button type="button">x</button>`;
      col.append(item);
      items.set(itemId, item);
    }
    root.append(col);
    columns.set(id, col);
  }
  const containers = (): DndContainer[] =>
    [...columns.entries()].map(([id, el]) => ({
      id,
      el,
      items: (): DndItem[] =>
        [...el.querySelectorAll<HTMLElement>('.item')].map((i) => ({
          id: i.dataset.id as string,
          el: i,
        })),
    }));
  return { host, columns, items, containers };
}

export const center = (el: Element): { x: number; y: number } => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

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

export function pointerDown(target: Element, x: number, y: number, extra?: PointerEventInit): void {
  target.dispatchEvent(new PointerEvent('pointerdown', pointerInit(x, y, extra)));
}
export function pointerMove(x: number, y: number, extra?: PointerEventInit): void {
  document.dispatchEvent(new PointerEvent('pointermove', pointerInit(x, y, extra)));
}
export function pointerUp(x: number, y: number, extra?: PointerEventInit): void {
  document.dispatchEvent(new PointerEvent('pointerup', pointerInit(x, y, extra)));
}

export const frames = async (n = 2): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(() => r(undefined)));
};

/** Order of item ids per column as currently in the DOM. */
export const order = (board: Board): Record<string, string[]> =>
  Object.fromEntries(board.containers().map((c) => [c.id, c.items().map((i) => i.id)]));

export const messages = {
  lifted: (n: string, p: number, t: number, c: string) =>
    `Lifted ${n}, position ${p} of ${t} in ${c}`,
  moved: (n: string, p: number, t: number, c: string) =>
    `Moved ${n} to position ${p} of ${t} in ${c}`,
  dropped: (n: string, p: number, t: number, c: string) =>
    `Dropped ${n} at position ${p} of ${t} in ${c}`,
  cancelled: (n: string) => `Cancelled moving ${n}`,
};
