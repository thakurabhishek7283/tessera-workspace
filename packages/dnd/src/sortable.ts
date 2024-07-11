import { type Axis, type Box, dropIndex, pickContainer } from './geometry.js';

export interface DndItem {
  id: string;
  el: HTMLElement;
}

export interface DndContainer {
  id: string;
  el: HTMLElement;
  items: () => DndItem[];
  /** Containers may refuse some items (e.g. a full column). Defaults to accepting everything. */
  accepts?: (itemId: string) => boolean;
}

export interface MoveEvent {
  itemId: string;
  fromContainer: string;
  toContainer: string;
  fromIndex: number;
  /** Position in the destination once the item has been taken out of its old place. */
  toIndex: number;
}

export interface SortableMessages {
  /** `position` is 1-based and `total` includes the lifted item. */
  lifted(name: string, position: number, total: number, container: string): string;
  moved(name: string, position: number, total: number, container: string): string;
  dropped(name: string, position: number, total: number, container: string): string;
  cancelled(name: string): string;
}

export interface SortableOptions {
  /** Where pointer events are caught. Everything inside it, shadow roots included, is covered. */
  root: HTMLElement | ShadowRoot;
  containers: () => DndContainer[];
  /** CSS selector of the grab handle inside an item. Without it the whole item is the handle. */
  handleSelector?: string;
  /** The direction items are laid out in within a container. */
  axis: Axis;
  /** Called when an item was dropped somewhere new. Not called when it ends where it started. */
  onMove(event: MoveEvent): void | Promise<void>;
  /** Sends a message to an `aria-live` region. */
  announce(message: string): void;
  messages: SortableMessages;
  /** Spoken name of an item. Defaults to its `aria-label`, then its text. */
  labelOf?: (item: DndItem) => string;
  /** Spoken name of a list. Defaults to its `aria-label`, then its id. */
  containerLabel?: (container: DndContainer) => string;
  /** Keys that lift and drop an item from the keyboard. Default Space and Enter. */
  liftKeys?: readonly string[];
  /** Called after a keyboard or pointer drop has been handled; defaults to focusing the item. */
  restoreFocus?: (itemId: string) => void;
  /** The ghost that follows the pointer. Defaults to a deep clone of the item. */
  createGhost?: (item: DndItem) => HTMLElement;
  /** Where the ghost is attached; keep it inside the themed subtree. Defaults to `document.body`. */
  ghostParent?: () => HTMLElement;
  /** Return false to make an item not draggable (read-only boards). */
  canDrag?: (itemId: string) => boolean;
}

export interface Sortable {
  destroy(): void;
  readonly dragging: boolean;
}

const INTERACTIVE =
  'a[href], button, input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-no-drag]';
const MOUSE_THRESHOLD = 4;
const TOUCH_HOLD_MS = 200;
const TOUCH_SLOP = 8;

interface Drag {
  item: DndItem;
  from: { container: string; index: number };
  target: { container: string; index: number };
  ghost: HTMLElement;
  offset: { x: number; y: number };
  pointer: { x: number; y: number };
  size: { width: number; height: number };
  frame: number;
}

const rectOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

/** First element of `path` (innermost first) that matches `selector`, or undefined. */
const matchInPath = (path: EventTarget[], selector: string): Element | undefined =>
  path.find((n): n is Element => n instanceof Element && n.matches(selector));

/**
 * Sortable lists that work across shadow roots, for mouse, pen and touch.
 * Dragging shows a ghost, marks the origin with `data-dragging` and the destination with
 * `data-drop-target` (container), `data-drop-before` (the item that will follow the dropped one)
 * or `data-drop-end` (the last item, when dropping at the end). Hosts style those attributes.
 */
export function createSortable(options: SortableOptions): Sortable {
  let drag: Drag | undefined;
  let pending:
    | {
        item: DndItem;
        fromContainer: string;
        fromIndex: number;
        id: number;
        start: { x: number; y: number };
        pointerType: string;
        timer?: ReturnType<typeof setTimeout>;
      }
    | undefined;
  let suppressClick = false;

  const find = (
    path: EventTarget[],
  ): { item: DndItem; container: DndContainer; index: number } | undefined => {
    for (const container of options.containers()) {
      const items = container.items();
      for (const [index, item] of items.entries()) {
        if (path.includes(item.el)) return { item, container, index };
      }
    }
    return undefined;
  };

  // ---------- visual state ----------
  const clearMarks = (): void => {
    for (const container of options.containers()) {
      container.el.removeAttribute('data-drop-target');
      container.el.style.removeProperty('--dnd-item-width');
      container.el.style.removeProperty('--dnd-item-height');
      for (const item of container.items()) {
        item.el.removeAttribute('data-drop-before');
        item.el.removeAttribute('data-drop-end');
      }
    }
  };

  const mark = (state: Pick<Drag, 'item' | 'target' | 'size'>): void => {
    clearMarks();
    const container = options.containers().find((c) => c.id === state.target.container);
    if (!container) return;
    container.el.setAttribute('data-drop-target', '');
    container.el.style.setProperty('--dnd-item-width', `${state.size.width}px`);
    container.el.style.setProperty('--dnd-item-height', `${state.size.height}px`);
    const others = container.items().filter((i) => i.id !== state.item.id);
    const before = others[state.target.index];
    if (before) before.el.setAttribute('data-drop-before', '');
    else others.at(-1)?.el.setAttribute('data-drop-end', '');
  };

  // ---------- spoken feedback ----------
  const nameOf = (item: DndItem): string =>
    options.labelOf?.(item) ??
    (item.el.getAttribute('aria-label') || item.el.textContent?.trim().slice(0, 60) || item.id);
  const containerName = (id: string): string => {
    const container = options.containers().find((c) => c.id === id);
    if (!container) return id;
    return options.containerLabel?.(container) ?? (container.el.getAttribute('aria-label') || id);
  };
  const itemsAfterDrop = (target: { container: string }, itemId: string): number => {
    const container = options.containers().find((c) => c.id === target.container);
    const others = container?.items().filter((i) => i.id !== itemId).length ?? 0;
    return others + 1;
  };
  const focusItem = (itemId: string): void => {
    if (options.restoreFocus) {
      options.restoreFocus(itemId);
      return;
    }
    requestAnimationFrame(() => {
      for (const c of options.containers()) {
        const found = c.items().find((i) => i.id === itemId);
        if (found) {
          found.el.focus();
          return;
        }
      }
    });
  };

  // ---------- pointer drag ----------
  const retarget = (state: Drag): void => {
    const candidates = options
      .containers()
      .filter((c) => c.accepts?.(state.item.id) ?? true)
      .map((c) => ({ c, box: rectOf(c.el) }));
    const hit = pickContainer(candidates, state.pointer);
    if (!hit) return;
    const rects = hit.c
      .items()
      .filter((i) => i.id !== state.item.id)
      .map((i) => rectOf(i.el));
    const index = dropIndex(rects, state.pointer, options.axis);
    if (state.target.container !== hit.c.id || state.target.index !== index) {
      state.target = { container: hit.c.id, index };
      mark(state);
    }
  };

  const place = (state: Drag): void => {
    const x = state.pointer.x - state.offset.x;
    const y = state.pointer.y - state.offset.y;
    state.ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const frame = (): void => {
    const state = drag;
    if (!state) return;
    place(state);
    retarget(state);
    state.frame = requestAnimationFrame(frame);
  };

  const begin = (): void => {
    const p = pending;
    if (!p) return;
    clearTimeout(p.timer);
    const rect = p.item.el.getBoundingClientRect();
    const ghost = options.createGhost?.(p.item) ?? (p.item.el.cloneNode(true) as HTMLElement);
    Object.assign(ghost.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      pointerEvents: 'none',
      zIndex: '2147483000',
      willChange: 'transform',
      boxShadow: 'var(--tessera-shadow-lg, 0 12px 32px rgb(15 23 42 / 0.22))',
    });
    ghost.setAttribute('data-dnd-ghost', '');
    ghost.removeAttribute('id');
    (options.ghostParent?.() ?? document.body).append(ghost);
    p.item.el.setAttribute('data-dragging', '');
    document.documentElement.setAttribute('data-dnd-active', '');

    drag = {
      item: p.item,
      from: { container: p.fromContainer, index: p.fromIndex },
      target: { container: p.fromContainer, index: p.fromIndex },
      ghost,
      offset: { x: p.start.x - rect.left, y: p.start.y - rect.top },
      pointer: { ...p.start },
      size: { width: rect.width, height: rect.height },
      frame: 0,
    };
    pending = undefined;
    mark(drag);
    drag.frame = requestAnimationFrame(frame);
  };

  const finish = async (commit: boolean): Promise<void> => {
    const state = drag;
    if (!state) return;
    cancelAnimationFrame(state.frame);
    drag = undefined;
    state.ghost.remove();
    state.item.el.removeAttribute('data-dragging');
    document.documentElement.removeAttribute('data-dnd-active');
    document.removeEventListener('touchmove', blockTouchScroll);
    clearMarks();
    // The click that follows a pointerup on the dragged item must not open the item.
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);
    const moved =
      state.target.container !== state.from.container || state.target.index !== state.from.index;
    if (commit && moved) {
      await options.onMove({
        itemId: state.item.id,
        fromContainer: state.from.container,
        toContainer: state.target.container,
        fromIndex: state.from.index,
        toIndex: state.target.index,
      });
      options.announce(
        options.messages.dropped(
          nameOf(state.item),
          state.target.index + 1,
          itemsAfterDrop(state.target, state.item.id),
          containerName(state.target.container),
        ),
      );
    } else if (!commit) {
      options.announce(options.messages.cancelled(nameOf(state.item)));
    }
  };

  // ---------- keyboard drag ----------
  interface Lift {
    item: DndItem;
    from: { container: string; index: number };
    target: { container: string; index: number };
    size: { width: number; height: number };
  }
  let lift: Lift | undefined;

  const accepting = (itemId: string): DndContainer[] =>
    options.containers().filter((c) => c.accepts?.(itemId) ?? true);

  const describe = (l: Lift): [string, number, number, string] => [
    nameOf(l.item),
    l.target.index + 1,
    itemsAfterDrop(l.target, l.item.id),
    containerName(l.target.container),
  ];

  const endLift = (): void => {
    document.removeEventListener('keydown', onLiftKey, true);
    document.removeEventListener('pointerdown', onLiftPointer, true);
    lift?.item.el.removeAttribute('data-dragging');
    clearMarks();
    lift = undefined;
  };

  const onLiftPointer = (): void => {
    const l = lift;
    if (!l) return;
    endLift();
    options.announce(options.messages.cancelled(nameOf(l.item)));
  };

  const showTarget = (l: Lift): void => {
    mark(l);
    const marked = options
      .containers()
      .flatMap((c) => c.items())
      .find((i) => i.el.hasAttribute('data-drop-before') || i.el.hasAttribute('data-drop-end'));
    (marked?.el ?? l.item.el).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  const moveWithin = (l: Lift, delta: number): void => {
    const container = options.containers().find((c) => c.id === l.target.container);
    if (!container) return;
    const others = container.items().filter((i) => i.id !== l.item.id).length;
    const index = Math.min(Math.max(l.target.index + delta, 0), others);
    if (index === l.target.index) return;
    l.target.index = index;
    showTarget(l);
    options.announce(options.messages.moved(...describe(l)));
  };

  const moveAcross = (l: Lift, delta: number): void => {
    const list = accepting(l.item.id);
    const at = list.findIndex((c) => c.id === l.target.container);
    const next = list[at + delta];
    if (at < 0 || !next) return;
    const others = next.items().filter((i) => i.id !== l.item.id).length;
    l.target = { container: next.id, index: Math.min(l.target.index, others) };
    showTarget(l);
    options.announce(options.messages.moved(...describe(l)));
  };

  const dropLift = async (): Promise<void> => {
    const l = lift;
    if (!l) return;
    endLift();
    const moved = l.target.container !== l.from.container || l.target.index !== l.from.index;
    if (moved) {
      await options.onMove({
        itemId: l.item.id,
        fromContainer: l.from.container,
        toContainer: l.target.container,
        fromIndex: l.from.index,
        toIndex: l.target.index,
      });
    }
    options.announce(options.messages.dropped(...describe(l)));
    focusItem(l.item.id);
  };

  function onLiftKey(event: KeyboardEvent): void {
    const l = lift;
    if (!l) return;
    const lifters = options.liftKeys ?? [' ', 'Enter'];
    const [back, forward, prevList, nextList] =
      options.axis === 'vertical'
        ? ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
        : ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    const handled = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.key === 'Escape') {
      handled();
      endLift();
      options.announce(options.messages.cancelled(nameOf(l.item)));
      focusItem(l.item.id);
    } else if (lifters.includes(event.key)) {
      handled();
      void dropLift();
    } else if (event.key === back) {
      handled();
      moveWithin(l, -1);
    } else if (event.key === forward) {
      handled();
      moveWithin(l, 1);
    } else if (event.key === prevList) {
      handled();
      moveAcross(l, -1);
    } else if (event.key === nextList) {
      handled();
      moveAcross(l, 1);
    } else if (event.key === 'Tab') {
      // Leaving the item ends the lift without moving it.
      endLift();
      options.announce(options.messages.cancelled(nameOf(l.item)));
    }
  }

  const onRootKeyDown = (event: Event): void => {
    const e = event as KeyboardEvent;
    if (lift || drag || !(options.liftKeys ?? [' ', 'Enter']).includes(e.key)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const path = e.composedPath();
    const hit = find(path);
    if (!hit || options.canDrag?.(hit.item.id) === false) return;
    const origin = path[0] as Element | undefined;
    // Only the item itself (or its handle) lifts; keys pressed in inner controls keep their meaning.
    const onItem = origin === hit.item.el;
    const onHandle =
      options.handleSelector !== undefined &&
      origin instanceof Element &&
      origin.matches(options.handleSelector);
    if (!onItem && !onHandle) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = hit.item.el.getBoundingClientRect();
    lift = {
      item: hit.item,
      from: { container: hit.container.id, index: hit.index },
      target: { container: hit.container.id, index: hit.index },
      size: { width: rect.width, height: rect.height },
    };
    hit.item.el.setAttribute('data-dragging', '');
    mark(lift);
    document.addEventListener('keydown', onLiftKey, true);
    document.addEventListener('pointerdown', onLiftPointer, true);
    options.announce(options.messages.lifted(...describe(lift)));
  };

  const blockTouchScroll = (event: Event): void => {
    if (event.cancelable) event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (drag) {
      drag.pointer = { x: event.clientX, y: event.clientY };
      return;
    }
    const p = pending;
    if (!p || event.pointerId !== p.id) return;
    const moved = Math.hypot(event.clientX - p.start.x, event.clientY - p.start.y);
    if (p.pointerType === 'touch') {
      // Moving before the hold elapsed means the user is scrolling.
      if (moved > TOUCH_SLOP) cancelPending();
      return;
    }
    if (moved > MOUSE_THRESHOLD) {
      p.start = { x: event.clientX, y: event.clientY };
      begin();
    }
  };

  const cancelPending = (): void => {
    if (pending) clearTimeout(pending.timer);
    pending = undefined;
    stopListening();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (pending && event.pointerId === pending.id) cancelPending();
    if (drag) {
      stopListening();
      void finish(true);
    }
  };

  const onPointerCancel = (): void => {
    cancelPending();
    if (drag) {
      stopListening();
      void finish(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && (drag || pending)) {
      event.preventDefault();
      event.stopPropagation();
      cancelPending();
      stopListening();
      void finish(false);
    }
  };

  const onSelectStart = (event: Event): void => {
    if (drag || pending) event.preventDefault();
  };

  const listen = (): void => {
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('selectstart', onSelectStart);
  };
  const stopListening = (): void => {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerCancel);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('selectstart', onSelectStart);
  };

  const onPointerDown = (event: Event): void => {
    const e = event as PointerEvent;
    if (drag || pending || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const path = e.composedPath();
    const hit = find(path);
    if (!hit || options.canDrag?.(hit.item.id) === false) return;
    if (options.handleSelector) {
      // The handle may live in the item's own shadow root, so look along the event path.
      if (!matchInPath(path.slice(0, path.indexOf(hit.item.el)), options.handleSelector)) return;
    } else if (matchInPath(path.slice(0, path.indexOf(hit.item.el)), INTERACTIVE)) {
      // Buttons, links and inputs inside an item keep their own behaviour.
      return;
    }
    pending = {
      item: hit.item,
      fromContainer: hit.container.id,
      fromIndex: hit.index,
      id: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      pointerType: e.pointerType,
    };
    if (e.pointerType === 'touch') {
      pending.timer = setTimeout(() => {
        begin();
        document.addEventListener('touchmove', blockTouchScroll, { passive: false });
      }, TOUCH_HOLD_MS);
    }
    listen();
  };

  const onClickCapture = (event: Event): void => {
    if (suppressClick) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  options.root.addEventListener('pointerdown', onPointerDown);
  options.root.addEventListener('keydown', onRootKeyDown);
  options.root.addEventListener('click', onClickCapture, true);

  return {
    destroy() {
      options.root.removeEventListener('pointerdown', onPointerDown);
      options.root.removeEventListener('click', onClickCapture, true);
      options.root.removeEventListener('keydown', onRootKeyDown);
      endLift();
      cancelPending();
      stopListening();
      void finish(false);
    },
    get dragging() {
      return drag !== undefined || lift !== undefined;
    },
  };
}
