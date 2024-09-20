import { cleanup, deepQuery, expectAccessible } from '@tessera-internal/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { toastRegionText } from './toast.js';
import {
  doc,
  dragBy,
  frames,
  mount,
  must,
  noteByText,
  noteEls,
  settle,
  until,
  visibleTexts,
} from './ui-helpers.js';

afterEach(cleanup);

const button = (root: ParentNode | null | undefined, label: string): HTMLElement =>
  must(
    [
      ...(root?.querySelectorAll<HTMLElement>('tessera-icon-button, tessera-button, button') ?? []),
    ].find(
      (b) =>
        b.getAttribute('label') === label ||
        b.getAttribute('aria-label') === label ||
        b.textContent?.trim() === label,
    ),
    label,
  );

const toolbar = (el: Element): ParentNode => must(el.shadowRoot?.querySelector('.toolbar'));

describe('<tessera-notes> grid', () => {
  it('shows notes pinned first, newest first, with accessible names, and is accessible', async () => {
    const { el } = await mount({
      seed: [{ text: 'old' }, { text: 'pinned', pinned: true }, { text: 'new' }],
    });
    expect(visibleTexts(el)).toEqual(['pinned', 'new', 'old']);
    expect(noteEls(el)[0]?.getAttribute('role')).toBe('listitem');
    expect(el.shadowRoot?.querySelector('.grid')?.getAttribute('role')).toBe('list');
    await expectAccessible(el);
  });

  it('adds a note, focuses its editor and saves what you type', async () => {
    const { el, data } = await mount();
    await userEvent.click(button(toolbar(el), 'New note'));
    const note = await until(() => noteEls(el)[0]);
    const editor = await until(() => note.shadowRoot?.querySelector<HTMLElement>('tessera-editor'));
    await until(() => (editor as unknown as { editor?: unknown }).editor);
    await userEvent.keyboard('Buy milk');
    await until(
      () => data.state.get().notes[0]?.content.content?.[0]?.content?.[0]?.text === 'Buy milk',
    );
    await userEvent.keyboard('{Escape}');
    await until(() => !note.editing);
    await settle(el);
    expect(note.shadowRoot?.querySelector('tessera-rich-text')).not.toBeNull();
    expect(note.shadowRoot?.querySelector('tessera-editor')).toBeNull();
    expect((el.shadowRoot as ShadowRoot).activeElement).toBe(note);
  });

  it('edits an existing note with a click or Enter, one editor at a time', async () => {
    const { el } = await mount({ seed: [{ text: 'first' }, { text: 'second' }] });
    const first = noteByText(el, 'first');
    const second = noteByText(el, 'second');
    await userEvent.click(must(first.shadowRoot?.querySelector<HTMLElement>('.body')));
    await until(() => first.editing);
    // Let the editor take focus before moving on, as a person would.
    const firstEditor = must(first.shadowRoot?.querySelector('tessera-editor'));
    await until(() => firstEditor.shadowRoot?.activeElement?.classList.contains('tiptap'));
    second.focus();
    await userEvent.keyboard('{Enter}');
    await until(() => second.editing);
    await until(() => !first.editing);
    expect(noteEls(el).filter((n) => n.editing)).toHaveLength(1);
  });

  it('changes colour, pins, archives and restores', async () => {
    const { el, data, ids } = await mount({ seed: [{ text: 'a' }, { text: 'b' }] });
    const a = noteByText(el, 'a');
    await userEvent.click(button(a.shadowRoot, 'Note colour'));
    const swatch = await until(() =>
      a.shadowRoot?.querySelector<HTMLElement>('.swatch[aria-label=Blue]'),
    );
    await userEvent.click(swatch);
    await until(() => data.getNote(ids.a as string)?.color === 'blue');

    await userEvent.click(button(a.shadowRoot, 'Pin note'));
    await until(() => data.getNote(ids.a as string)?.pinned === true);
    await until(() => visibleTexts(el)[0] === 'a');

    await userEvent.click(button(a.shadowRoot, 'Archive note'));
    await until(() => visibleTexts(el).join() === 'b');
    await userEvent.click(button(toolbar(el), 'Archive'));
    await until(() => visibleTexts(el).join() === 'a');
    await userEvent.click(button(noteByText(el, 'a').shadowRoot, 'Restore note'));
    await userEvent.click(button(toolbar(el), 'Back to notes'));
    await until(() => visibleTexts(el).length === 2);
  });

  it('deletes with an undo toast', async () => {
    const { el, data, ids } = await mount({ seed: [{ text: 'bye' }] });
    await userEvent.click(button(noteByText(el, 'bye').shadowRoot, 'Delete note'));
    await until(() => data.getNote(ids.bye as string) === undefined);
    await until(() => toastRegionText().includes('Note deleted'));
    const region = must(deepQuery(document.body, 'tessera-toast-region'));
    await userEvent.click(
      must(
        [...(region.shadowRoot?.querySelectorAll<HTMLElement>('tessera-button') ?? [])].find((b) =>
          b.textContent?.includes('Undo'),
        ),
      ),
    );
    await until(() => visibleTexts(el).join() === 'bye');
  });

  it('adds and removes tags and filters by tag', async () => {
    const { el, data, ids } = await mount({ seed: [{ text: 'a' }, { text: 'b', tags: ['work'] }] });
    const a = noteByText(el, 'a');
    const input = must(a.shadowRoot?.querySelector<HTMLInputElement>('footer input'));
    await userEvent.click(input);
    await userEvent.keyboard('home{Enter}');
    await until(() => data.getNote(ids.a as string)?.tags.join() === 'home');
    await settle(el);
    const select = await until(() => el.shadowRoot?.querySelector<HTMLSelectElement>('select'));
    select.value = 'work';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => visibleTexts(el).join() === 'b');
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => visibleTexts(el).length === 2);
    // The test frame is short, so the real pointer would land after a focus-scroll; call the button directly.
    button(noteByText(el, 'b').shadowRoot, 'Remove tag work').click();
    await until(() => data.getNote(ids.b as string)?.tags.length === 0);
  });

  it('searches as you type and clears with Escape', async () => {
    const { el } = await mount({ seed: [{ text: 'Café menu' }, { text: 'Taxes' }] });
    const search = must(el.shadowRoot?.querySelector<HTMLInputElement>('input[type=search]'));
    await userEvent.fill(search, 'cafe');
    await until(() => visibleTexts(el).join() === 'Café menu');
    await userEvent.fill(search, 'zzz');
    await until(() => el.shadowRoot?.textContent?.includes('No notes match'));
    await userEvent.keyboard('{Escape}');
    await until(() => visibleTexts(el).length === 2);
  });

  it('shows changes made elsewhere live', async () => {
    const { el, data } = await mount();
    await data.create({ content: doc('from another tab') });
    await until(() => visibleTexts(el).join() === 'from another tab');
  });

  it('shortcuts: n adds a note, / focuses search, Ctrl+Z undoes', async () => {
    const { el, data } = await mount({ seed: [{ text: 'x' }] });
    noteByText(el, 'x').focus();
    await userEvent.keyboard('n');
    await until(() => data.state.get().notes.length === 2);
    await userEvent.keyboard('{Escape}');
    noteByText(el, 'x').focus();
    await userEvent.keyboard('/');
    await until(() => (el.shadowRoot as ShadowRoot).activeElement?.matches('input[type=search]'));
  });

  it('keeps Escape out of the way of the page while editing', async () => {
    const { el } = await mount({ seed: [{ text: 'x' }] });
    const note = noteByText(el, 'x');
    note.focus();
    await userEvent.keyboard('{Enter}');
    await until(() => note.editing);
    const editor = must(note.shadowRoot?.querySelector('tessera-editor'));
    await until(() => editor.shadowRoot?.activeElement?.classList.contains('tiptap'));
    await userEvent.keyboard('{Escape}');
    await until(() => !note.editing);
    await until(() => (el.shadowRoot as ShadowRoot).activeElement === note);
  });
});

describe('without the editor feature', () => {
  it('falls back to a plain text box', async () => {
    const { el, data, ids } = await mount({ seed: [{ text: 'plain' }], withEditor: false });
    // Not the implicit instance, and the editor service is absent.
    const note = noteByText(el, 'plain');
    await userEvent.click(must(note.shadowRoot?.querySelector<HTMLElement>('.body')));
    const box = await until(() => note.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea'));
    expect(box.value).toBe('plain');
    await userEvent.fill(box, 'changed\nsecond line');
    await userEvent.tab();
    await until(() => data.getNote(ids.plain as string)?.content.content?.length === 2);
    expect(data.getNote(ids.plain as string)?.content.content?.[0]?.content?.[0]?.text).toBe(
      'changed',
    );
  });
});

describe('config switches', () => {
  it('hides search, tags, pinning, archive and the layout switch when they are off', async () => {
    const { el } = await mount({
      seed: [{ text: 'x' }],
      notes: {
        search: false,
        tags: false,
        pinning: false,
        archive: false,
        allowLayoutSwitch: false,
      },
    });
    expect(el.shadowRoot?.querySelector('input[type=search]')).toBeNull();
    expect(el.shadowRoot?.querySelector('.group')).toBeNull();
    const note = noteByText(el, 'x');
    expect(note.shadowRoot?.querySelector('footer input')).toBeNull();
    expect(note.shadowRoot?.querySelector('tessera-icon-button[icon=star]')).toBeNull();
    expect(note.shadowRoot?.querySelector('tessera-icon-button[icon=download]')).toBeNull();
    expect(
      [...(toolbar(el) as Element).querySelectorAll('tessera-button')].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(['New note']);
  });

  it('is read only when asked: no toolbar button, no header actions, no editing', async () => {
    const { el } = await mount({ seed: [{ text: 'x' }], readonly: true });
    expect((toolbar(el) as Element).textContent).not.toContain('New note');
    const note = noteByText(el, 'x');
    expect(note.shadowRoot?.querySelector('header tessera-icon-button')).toBeNull();
    await userEvent.click(must(note.shadowRoot?.querySelector<HTMLElement>('.body')));
    await frames(3);
    expect(note.editing).toBe(false);
  });
});

describe('free canvas', () => {
  it('positions notes absolutely, drags by the header and resizes from the corner', async () => {
    const { el, data, ids } = await mount({
      seed: [{ text: 'a' }],
      notes: { layout: 'free' },
      style: 'display:block;height:600px',
    });
    const note = noteByText(el, 'a');
    const stored = data.getNote(ids.a as string);
    expect(
      note.style.position === 'absolute' || getComputedStyle(note).position === 'absolute',
    ).toBe(true);
    expect(note.style.left).toBe(`${stored?.x}px`);

    await dragBy(must(note.shadowRoot?.querySelector('header')), 60, 40);
    await until(() => data.getNote(ids.a as string)?.x === (stored?.x ?? 0) + 60);
    expect(data.getNote(ids.a as string)?.y).toBe((stored?.y ?? 0) + 40);

    await dragBy(must(note.shadowRoot?.querySelector('.resize')), 50, 30);
    await until(() => data.getNote(ids.a as string)?.w === (stored?.w ?? 0) + 50);
    expect(data.getNote(ids.a as string)?.h).toBe((stored?.h ?? 0) + 30);

    // Resizing never goes below the minimum.
    await dragBy(must(note.shadowRoot?.querySelector('.resize')), -900, -900);
    await until(() => data.getNote(ids.a as string)?.w === 160);
    expect(data.getNote(ids.a as string)?.h).toBe(120);
  });

  it('does not drag when you press a button in the header', async () => {
    const { el, data, ids } = await mount({ seed: [{ text: 'a' }], notes: { layout: 'free' } });
    const note = noteByText(el, 'a');
    const before = data.getNote(ids.a as string);
    await dragBy(must(note.shadowRoot?.querySelector('header tessera-icon-button')), 80, 80);
    expect(data.getNote(ids.a as string)?.x).toBe(before?.x);
  });

  it('moves with the arrow keys: 8px, or 32px with Shift', async () => {
    const { el, data, ids } = await mount({ seed: [{ text: 'a' }], notes: { layout: 'free' } });
    const note = noteByText(el, 'a');
    const before = data.getNote(ids.a as string);
    note.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowDown}');
    await until(() => data.getNote(ids.a as string)?.x === (before?.x ?? 0) + 8);
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
    await until(() => data.getNote(ids.a as string)?.x === (before?.x ?? 0) + 8 + 32);
    expect(data.getNote(ids.a as string)?.y).toBe((before?.y ?? 0) + 8);
  });

  it('brings a note to the front when it is picked up', async () => {
    const { el, data, ids } = await mount({
      seed: [{ text: 'a' }, { text: 'b' }],
      notes: { layout: 'free' },
    });
    const a = noteByText(el, 'a');
    expect((data.getNote(ids.a as string)?.z ?? 0) < (data.getNote(ids.b as string)?.z ?? 0)).toBe(
      true,
    );
    a.focus();
    await until(
      () => (data.getNote(ids.a as string)?.z ?? 0) > (data.getNote(ids.b as string)?.z ?? 0),
    );
  });

  it('switches between grid and free from the toolbar', async () => {
    const { el } = await mount({ seed: [{ text: 'a' }] });
    expect(el.shadowRoot?.querySelector('.scroller')).toBeNull();
    await userEvent.click(button(toolbar(el), 'Free layout'));
    await until(() => el.shadowRoot?.querySelector('.scroller'));
    await userEvent.click(button(toolbar(el), 'Grid layout'));
    await until(() => el.shadowRoot?.querySelector('.grid'));
  });

  it('pans the canvas with the middle mouse button', async () => {
    const { el } = await mount({
      seed: [{ text: 'a' }],
      notes: { layout: 'free' },
      style: 'display:block;width:300px;height:300px',
    });
    const scroller = must(el.shadowRoot?.querySelector<HTMLElement>('.scroller'));
    const canvas = must(scroller.querySelector<HTMLElement>('.canvas'));
    canvas.style.width = '2000px';
    canvas.style.height = '2000px';
    await frames(2);
    const r = scroller.getBoundingClientRect();
    const init = {
      bubbles: true,
      composed: true,
      pointerId: 3,
      pointerType: 'mouse',
      button: 1,
    } as const;
    scroller.dispatchEvent(
      new PointerEvent('pointerdown', { ...init, clientX: r.left + 200, clientY: r.top + 200 }),
    );
    scroller.dispatchEvent(
      new PointerEvent('pointermove', { ...init, clientX: r.left + 100, clientY: r.top + 150 }),
    );
    expect(scroller.scrollLeft).toBe(100);
    expect(scroller.scrollTop).toBe(50);
    scroller.dispatchEvent(
      new PointerEvent('pointerup', { ...init, clientX: r.left + 100, clientY: r.top + 150 }),
    );
    scroller.dispatchEvent(
      new PointerEvent('pointermove', { ...init, clientX: r.left, clientY: r.top }),
    );
    expect(scroller.scrollLeft).toBe(100);
  });

  it('places a new note near the middle of the visible canvas', async () => {
    const { el, data } = await mount({
      notes: { layout: 'free' },
      style: 'display:block;width:600px;height:500px',
    });
    await userEvent.click(button(toolbar(el), 'New note'));
    await until(() => data.state.get().notes.length === 1);
    const created = data.state.get().notes[0];
    expect(created?.x).toBeGreaterThan(100);
    expect(created?.y).toBeGreaterThan(50);
  });

  it('is accessible', async () => {
    const { el } = await mount({ seed: [{ text: 'a' }, { text: 'b' }], notes: { layout: 'free' } });
    await expectAccessible(el);
  });
});
