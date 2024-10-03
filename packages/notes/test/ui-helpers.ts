import type { TesseraInstance } from '@tessera/core';
import '@tessera/elements/define';
import { mountInstance, must, until } from '@tessera-internal/test-utils';
import '../src/elements/index.js';
import type { TesseraNote } from '../src/elements/note.js';
import type { TesseraNotesElement } from '../src/elements/notes.js';
import type { NotesApi, NotesController } from '../src/index.js';

export const plugins = {
  notes: () => import('../src/plugin.js'),
  editor: () => import('@tessera/editor'),
};

export const doc = (text: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

export interface Mounted {
  instance: TesseraInstance;
  api: NotesApi;
  /** Another controller on the same board, for seeding and checking what was stored. */
  data: NotesController;
  el: TesseraNotesElement;
  ids: Record<string, string>;
}

export interface MountOptions {
  notes?: Record<string, unknown>;
  seed?: Array<{
    text: string;
    tags?: string[];
    pinned?: boolean;
    color?: 'yellow' | 'pink' | 'blue';
  }>;
  readonly?: boolean;
  locale?: string;
  theme?: 'light' | 'dark';
  withEditor?: boolean;
  style?: string;
  board?: string;
}

export async function mount(opts: MountOptions = {}): Promise<Mounted> {
  const withEditor = opts.withEditor !== false;
  const { instance, root } = await mountInstance(
    {
      appId: 'notes-ui',
      ...(opts.locale ? { locale: opts.locale } : {}),
      ...(opts.theme ? { theme: { mode: opts.theme } } : {}),
      features: {
        notes: { enabled: true, ...opts.notes },
        ...(withEditor ? { editor: { enabled: true } } : {}),
      },
    },
    plugins,
  );
  // The host app paints the page; the kit only sets text colours for the theme.
  if (opts.theme) root.style.background = 'var(--tessera-color-bg)';
  const api = instance.feature('notes') as NotesApi;
  const data = await api.open(opts.board);
  const ids: Record<string, string> = {};
  for (const s of opts.seed ?? []) {
    // Notes are ordered by when they changed, so give each one its own moment.
    (instance.ctx.clock as unknown as { advance(ms: number): void }).advance(1000);
    const note = await data.create({
      content: doc(s.text),
      ...(s.tags ? { tags: s.tags } : {}),
      ...(s.pinned ? { pinned: true } : {}),
      ...(s.color ? { color: s.color } : {}),
    });
    ids[s.text] = note.id;
    await new Promise((r) => setTimeout(r, 2));
  }
  const el = document.createElement('tessera-notes') as TesseraNotesElement;
  if (opts.board) el.setAttribute('board', opts.board);
  if (opts.readonly) el.readonly = true;
  if (opts.style) el.style.cssText = opts.style;
  root.append(el);
  await until(() => el.controller && !el.controller.state.get().loading);
  await settle(el);
  return { instance, api, data, el, ids };
}

export async function settle(el: Element): Promise<void> {
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

export const noteEls = (el: Element): TesseraNote[] => [
  ...(el.shadowRoot?.querySelectorAll<TesseraNote>('tessera-note') ?? []),
];

export const noteByText = (el: Element, text: string): TesseraNote =>
  must(
    noteEls(el).find(
      (n) =>
        n.shadowRoot?.querySelector('.body')?.textContent?.includes(text) ||
        n.getAttribute('aria-label')?.includes(text),
    ),
    `note "${text}"`,
  );

export const visibleTexts = (el: Element): string[] =>
  noteEls(el).map((n) => n.getAttribute('aria-label') ?? '');

export const frames = async (n = 2): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(() => r(undefined)));
};

const pointer = (type: string, x: number, y: number, extra: PointerEventInit = {}): PointerEvent =>
  new PointerEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: 7,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    ...extra,
  });

/** Drags with synthetic pointer events dispatched on `target`. */
export async function dragBy(
  target: Element,
  dx: number,
  dy: number,
  extra?: PointerEventInit,
): Promise<void> {
  const r = target.getBoundingClientRect();
  const x = r.left + Math.min(r.width / 2, 40);
  const y = r.top + r.height / 2;
  target.dispatchEvent(pointer('pointerdown', x, y, extra));
  for (let i = 1; i <= 3; i++) {
    target.dispatchEvent(pointer('pointermove', x + (dx * i) / 3, y + (dy * i) / 3, extra));
    await frames(1);
  }
  target.dispatchEvent(pointer('pointerup', x + dx, y + dy, extra));
  await frames(2);
}

export { must, until };
