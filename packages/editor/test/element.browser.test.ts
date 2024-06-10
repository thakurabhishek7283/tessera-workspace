import type { TesseraInstance } from '@tessera/core';
import '@tessera/elements/define';
import {
  cleanup,
  deepQuery,
  expectAccessible,
  fixture,
  mountInstance,
  must,
  until,
} from '@tessera-internal/test-utils';
import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import '../src/elements/index.js';
import type { TesseraEditorElement } from '../src/elements/editor.js';
import type { RichDoc } from '../src/index.js';

afterEach(cleanup);

const plugins = { editor: () => import('../src/plugin.js') };
const doc = (text: string): RichDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

async function mount(
  template: (instance: TesseraInstance) => ReturnType<typeof html>,
  editor: Record<string, unknown> = {},
): Promise<{ el: TesseraEditorElement; instance: TesseraInstance }> {
  const { instance, root } = await mountInstance(
    { appId: 'editor-el', features: { editor: { enabled: true, ...editor } } },
    plugins,
  );
  const host = await fixture(template(instance));
  root.append(host);
  const el = must(
    host.matches('tessera-editor') ? host : host.querySelector('tessera-editor'),
  ) as TesseraEditorElement;
  await el.editorReady;
  await el.updateComplete;
  return { el, instance };
}

const q = <T extends HTMLElement = HTMLElement>(el: Element, sel: string): T =>
  must(el.shadowRoot?.querySelector<T>(sel), sel);

const buttonByLabel = (el: Element, label: string): HTMLButtonElement =>
  must(
    [...(el.shadowRoot?.querySelectorAll<HTMLButtonElement>('[role=toolbar] button') ?? [])].find(
      (b) => b.getAttribute('aria-label') === label,
    ),
    `button ${label}`,
  );

describe('<tessera-editor>', () => {
  it('renders a labelled toolbar and editing area, and is accessible', async () => {
    const { el } = await mount(
      () => html`<tessera-editor placeholder="Write here" .value=${doc('Hello')}></tessera-editor>`,
    );
    const toolbar = q(el, '[role=toolbar]');
    expect(toolbar.getAttribute('aria-label')).toBe('Formatting');
    const area = q(el, '.tiptap');
    expect(area.getAttribute('role')).toBe('textbox');
    expect(area.getAttribute('aria-label')).toBe('Rich text editor');
    expect(area.textContent).toBe('Hello');
    await expectAccessible(el);
  });

  it('applies toolbar buttons to the selection and shows their pressed state', async () => {
    const { el } = await mount(
      () => html`<tessera-editor .value=${doc('hello')}></tessera-editor>`,
    );
    await userEvent.click(q(el, '.tiptap'));
    await userEvent.keyboard('{Control>}a{/Control}');
    const bold = buttonByLabel(el, 'Bold');
    expect(bold.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(bold);
    await until(() => buttonByLabel(el, 'Bold').getAttribute('aria-pressed') === 'true');
    expect(q(el, '.tiptap strong').textContent).toBe('hello');
    // The editor kept the selection, so the button toggles back.
    await userEvent.click(buttonByLabel(el, 'Bold'));
    await until(() => buttonByLabel(el, 'Bold').getAttribute('aria-pressed') === 'false');
  });

  it('changes block type with the heading select', async () => {
    const { el } = await mount(
      () => html`<tessera-editor .value=${doc('Title')}></tessera-editor>`,
    );
    await userEvent.click(q(el, '.tiptap'));
    const select = q<HTMLSelectElement>(el, 'select.tb-select');
    select.value = '2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => el.shadowRoot?.querySelector('.tiptap h2'));
  });

  it('disables undo and redo until there is something to undo', async () => {
    const { el } = await mount(() => html`<tessera-editor></tessera-editor>`);
    expect(buttonByLabel(el, 'Undo').disabled).toBe(true);
    await userEvent.click(q(el, '.tiptap'));
    await userEvent.keyboard('abc');
    await until(() => !buttonByLabel(el, 'Undo').disabled);
    expect(buttonByLabel(el, 'Redo').disabled).toBe(true);
  });

  it('moves between toolbar buttons with the arrow keys (roving tabindex)', async () => {
    const { el } = await mount(
      () => html`<tessera-editor toolbar="bold,italic,|,strike"></tessera-editor>`,
    );
    const buttons = [
      ...(el.shadowRoot?.querySelectorAll<HTMLButtonElement>('[role=toolbar] button') ?? []),
    ];
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1]);
    buttons[0]?.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(el.shadowRoot?.activeElement).toBe(buttonByLabel(el, 'Italic'));
    await userEvent.keyboard('{End}');
    expect(el.shadowRoot?.activeElement).toBe(buttonByLabel(el, 'Strikethrough'));
    await userEvent.keyboard('{ArrowRight}');
    expect(el.shadowRoot?.activeElement).toBe(buttonByLabel(el, 'Bold'));
  });

  it('takes the toolbar from the attribute, the feature config or the defaults', async () => {
    const { el } = await mount(
      () => html`<tessera-editor toolbar="bold, nonsense ,italic"></tessera-editor>`,
    );
    expect(el.shadowRoot?.querySelectorAll('[role=toolbar] button').length).toBe(2);
    const configured = await mount(() => html`<tessera-editor></tessera-editor>`, {
      toolbar: ['strike'],
    });
    expect(configured.el.shadowRoot?.querySelectorAll('[role=toolbar] button').length).toBe(1);
    const none = await mount(() => html`<tessera-editor></tessera-editor>`, { toolbar: [] });
    expect(none.el.shadowRoot?.querySelector('[role=toolbar]')).toBeNull();
  });

  it('keyboard shortcuts work inside the editing area', async () => {
    const { el } = await mount(() => html`<tessera-editor .value=${doc('x')}></tessera-editor>`);
    await userEvent.click(q(el, '.tiptap'));
    await userEvent.keyboard('{Control>}a{/Control}{Control>}i{/Control}');
    await until(() => el.shadowRoot?.querySelector('.tiptap em'));
  });

  it('shows the bubble menu for a selection and hides it without one', async () => {
    const { el } = await mount(
      () => html`<tessera-editor .value=${doc('select me')}></tessera-editor>`,
    );
    expect(el.shadowRoot?.querySelector('.bubble')).toBeNull();
    await userEvent.click(q(el, '.tiptap'));
    await userEvent.keyboard('{Control>}a{/Control}');
    const bubble = await until(() => el.shadowRoot?.querySelector<HTMLElement>('.bubble'));
    expect(bubble.querySelectorAll('button').length).toBe(6);
    await userEvent.click(must(bubble.querySelector<HTMLButtonElement>('[aria-label=Italic]')));
    await until(() => el.shadowRoot?.querySelector('.tiptap em'));
    await userEvent.keyboard('{ArrowRight}');
    await until(() => !el.shadowRoot?.querySelector('.bubble'));
  });

  it('can switch the bubble menu off', async () => {
    const { el } = await mount(
      () => html`<tessera-editor .value=${doc('select me')}></tessera-editor>`,
      {
        bubbleMenu: false,
      },
    );
    await userEvent.click(q(el, '.tiptap'));
    await userEvent.keyboard('{Control>}a{/Control}');
    await new Promise((r) => setTimeout(r, 100));
    expect(el.shadowRoot?.querySelector('.bubble')).toBeNull();
  });

  it('draws the slash menu and inserts a block from a click', async () => {
    const { el } = await mount(() => html`<tessera-editor></tessera-editor>`);
    await userEvent.click(q(el, '.tiptap'));
    await userEvent.keyboard('/task');
    const menu = await until(() => el.shadowRoot?.querySelector<HTMLElement>('[role=listbox]'));
    expect(menu.getAttribute('aria-label')).toBe('Insert a block');
    const area = q(el, '.tiptap');
    expect(area.getAttribute('aria-activedescendant')).toBe(
      menu.querySelector('[aria-selected=true]')?.id,
    );
    await userEvent.click(must(menu.querySelector<HTMLElement>('[role=option]')));
    await until(() => el.shadowRoot?.querySelector('.tiptap ul[data-type=taskList]'));
    expect(el.shadowRoot?.querySelector('[role=listbox]')).toBeNull();
  });

  it('adds a link through the link form and rejects unsafe addresses', async () => {
    const { el } = await mount(() => html`<tessera-editor .value=${doc('docs')}></tessera-editor>`);
    await userEvent.click(q(el, '.tiptap'));
    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.click(buttonByLabel(el, 'Link'));
    const input = await until(() =>
      el.shadowRoot?.querySelector<HTMLInputElement>('.link-form input'),
    );
    await userEvent.fill(input, 'https://example.com');
    await userEvent.keyboard('{Enter}');
    await until(() => el.shadowRoot?.querySelector('.tiptap a[href="https://example.com"]'));
    expect(el.shadowRoot?.querySelector('.link-form')).toBeNull();

    // A pressed link button removes the link.
    await userEvent.click(q(el, '.tiptap a'));
    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.click(buttonByLabel(el, 'Link'));
    await until(() => !el.shadowRoot?.querySelector('.tiptap a'));
  });

  it('hides the toolbar when read only and stops accepting input', async () => {
    const { el } = await mount(
      () => html`<tessera-editor readonly .value=${doc('fixed')}></tessera-editor>`,
    );
    expect(el.shadowRoot?.querySelector('[role=toolbar]')).toBeNull();
    expect(q(el, '.tiptap').getAttribute('contenteditable')).toBe('false');
    expect(q(el, '.tiptap').getAttribute('aria-readonly')).toBe('true');
    el.readonly = false;
    await until(() => q(el, '.tiptap').getAttribute('contenteditable') === 'true');
  });

  it('replaces the content when the value property changes, without echoing its own edits', async () => {
    const { el } = await mount(() => html`<tessera-editor .value=${doc('one')}></tessera-editor>`);
    el.value = doc('two');
    await until(() => q(el, '.tiptap').textContent === 'two');
    el.value = '# Heading';
    el.format = 'markdown';
    el.value = '## From markdown';
    await until(() => el.shadowRoot?.querySelector('.tiptap h2'));
  });

  it('fires change (debounced) and input-commit (on blur) events with the value', async () => {
    const { el } = await mount(() => html`<tessera-editor></tessera-editor>`);
    const onChange = vi.fn();
    const onCommit = vi.fn();
    el.addEventListener('change', (e) => onChange((e as CustomEvent).detail));
    el.addEventListener('input-commit', (e) => onCommit((e as CustomEvent).detail));
    await userEvent.click(q(el, '.tiptap'));
    await userEvent.keyboard('hi');
    await until(() => onChange.mock.calls.length);
    expect(onChange.mock.calls[0]?.[0].value).toMatchObject({ text: 'hi', isEmpty: false });
    expect(el.value).toEqual(onChange.mock.calls[0]?.[0].value.json);
    await userEvent.tab();
    await userEvent.tab();
    await until(() => onCommit.mock.calls.length);
  });

  it('takes part in forms: JSON value, required, maxlength and reset', async () => {
    const form = await fixture<HTMLFormElement>(
      html`<form><tessera-editor name="body" required maxlength="5" .value=${doc('ok')}></tessera-editor></form>`,
    );
    const { instance } = await mountInstance(
      { appId: 'editor-form', features: { editor: { enabled: true } } },
      plugins,
    );
    const el = must(form.querySelector<TesseraEditorElement>('tessera-editor'));
    el.tessera = instance;
    await el.editorReady;
    await el.updateComplete;

    expect(JSON.parse(String(new FormData(form).get('body')))).toEqual(doc('ok'));
    expect(form.checkValidity()).toBe(true);

    el.editor?.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
    await userEvent.click(q(el, '.tiptap'));
    await userEvent.keyboard('abcdefghi');
    // maxlength is enforced while typing, so the document is never over the limit.
    expect(el.editor?.state.get().characters).toBe(5);

    // Deleting everything makes the required field invalid once the edit is reported.
    await userEvent.keyboard('{Control>}a{/Control}{Backspace}');
    await until(() => el.validity.valueMissing);
    expect(form.checkValidity()).toBe(false);

    form.reset();
    await until(() => q(el, '.tiptap').textContent === 'ok');
    expect(form.checkValidity()).toBe(true);
  });

  it('is invalid when required and empty', async () => {
    const { el } = await mount(() => html`<tessera-editor required></tessera-editor>`);
    expect(el.checkValidity()).toBe(false);
    expect(el.validity.valueMissing).toBe(true);
    expect(el.validationMessage).toBe('Write something here');
    await userEvent.click(q(el, '.tiptap'));
    await userEvent.keyboard('x');
    await until(() => el.checkValidity());
  });

  it('renders nothing when the feature is disabled and comes back when it is enabled', async () => {
    const { instance, root } = await mountInstance(
      { appId: 'editor-toggle', features: { editor: { enabled: true } } },
      plugins,
    );
    const el = document.createElement('tessera-editor') as TesseraEditorElement;
    root.append(el);
    await el.editorReady;
    expect(el.hidden).toBe(false);
    await instance.disable('editor');
    await until(() => el.hidden && !el.editor);
    expect(el.shadowRoot?.querySelector('.frame')).toBeNull();
    await instance.enable('editor');
    await until(() => !el.hidden && el.editor);
  });

  it('shows the character count in the footer', async () => {
    const { el } = await mount(
      () => html`<tessera-editor maxlength="10" .value=${doc('abc')}></tessera-editor>`,
    );
    await until(() => q(el, 'footer').textContent?.includes('3 / 10'));
  });

  it('reports upload errors as an event and a toast', async () => {
    const { el } = await mount(() => html`<tessera-editor></tessera-editor>`, {
      images: { enabled: true, maxBytes: 5 },
    });
    const onError = vi.fn();
    el.addEventListener('upload-error', (e) => onError((e as CustomEvent).detail.error));
    await el.editor?.insertImage(new Blob(['0123456789'], { type: 'image/png' }));
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ code: 'UPLOAD_TOO_LARGE' });
    const toastRegion = must(deepQuery(document.body, 'tessera-toast-region'));
    await until(() => toastRegion.shadowRoot?.textContent?.includes('could not be added'));
  });

  it('stays usable after being moved in the DOM', async () => {
    const { el } = await mount(
      () => html`<tessera-editor .value=${doc('moved')}></tessera-editor>`,
    );
    const parent = must(el.parentElement);
    el.remove();
    parent.append(el);
    await until(() => el.editor);
    expect(q(el, '.tiptap').textContent).toBe('moved');
  });
});

describe('<tessera-rich-text>', () => {
  it('renders a document as sanitized HTML without needing an instance', async () => {
    const el = await fixture(
      html`<tessera-rich-text .doc=${{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<i>no</i>' }] }] }}></tessera-rich-text>`,
    );
    const content = q(el, '.prose');
    expect(content.innerHTML.replace(/<!--.*?-->/g, '')).toBe('<p>&lt;i&gt;no&lt;/i&gt;</p>');
  });
});
