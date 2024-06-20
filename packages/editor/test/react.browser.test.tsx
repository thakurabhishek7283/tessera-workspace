import '@tessera/elements/define';
import { cleanup, mountInstance, must, until } from '@tessera-internal/test-utils';
import { createRef, type ReactElement, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { TesseraEditorElement } from '../src/elements/editor.js';
import type { RichDoc } from '../src/index.js';
import { Editor, RichText, useEditor } from '../src/react/index.js';

afterEach(cleanup);

const doc = (text: string): RichDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

async function render(ui: ReactElement) {
  const { root } = await mountInstance(
    { appId: 'editor-react', features: { editor: { enabled: true } } },
    { editor: () => import('../src/plugin.js') },
  );
  const container = document.createElement('div');
  root.append(container);
  createRoot(container).render(ui);
  return container;
}

describe('<Editor>', () => {
  it('sets the value property and exposes the element through ref', async () => {
    const ref = createRef<TesseraEditorElement>();
    const container = await render(
      <Editor ref={ref} value={doc('from react')} placeholder="Type" />,
    );
    const el = await until(() => container.querySelector<TesseraEditorElement>('tessera-editor'));
    await el.editorReady;
    expect(ref.current).toBe(el);
    expect(el.placeholder).toBe('Type');
    await until(() => el.shadowRoot?.querySelector('.tiptap')?.textContent === 'from react');
  });

  it('delivers change events to onChange', async () => {
    const onChange = vi.fn();
    const container = await render(<Editor onChange={onChange} />);
    const el = await until(() => container.querySelector<TesseraEditorElement>('tessera-editor'));
    await el.editorReady;
    await userEvent.click(must(el.shadowRoot?.querySelector<HTMLElement>('.tiptap')));
    await userEvent.keyboard('typed');
    await until(() => onChange.mock.calls.length);
    expect(onChange.mock.calls[0]?.[0].detail.value.text).toBe('typed');
  });

  it('gives useEditor the handle once Tiptap has loaded', async () => {
    let seen: string | undefined;
    function Probe() {
      const ref = useRef<TesseraEditorElement>(null);
      const editor = useEditor(ref);
      seen = editor ? editor.getText() : undefined;
      return <Editor ref={ref} value={doc('probe')} />;
    }
    await render(<Probe />);
    await until(() => seen === 'probe');
  });

  it('keeps properties current across renders', async () => {
    const container = await render(<Editor readonly={false} value={doc('a')} />);
    const el = await until(() => container.querySelector<TesseraEditorElement>('tessera-editor'));
    expect(el.value).toEqual(doc('a'));
  });
});

describe('<RichText>', () => {
  it('shows a document', async () => {
    const container = await render(<RichText doc={doc('read only')} />);
    const el = await until(() => container.querySelector('tessera-rich-text'));
    await until(() => el.shadowRoot?.querySelector('.prose')?.textContent === 'read only');
  });
});
