import type { TesseraConfig } from '@tessera-kit/core';
import '@tessera-kit/elements/define';
import { cleanup, mountInstance, must, until } from '@tessera-internal/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { EditorHandle, EditorOptions, EditorService } from '../src/index.js';

afterEach(cleanup);

const plugins = { editor: () => import('../src/plugin.js') };

async function service(editor: Record<string, unknown> = {}, config: Partial<TesseraConfig> = {}) {
  const { instance } = await mountInstance(
    { appId: 'editor-test', ...config, features: { editor: { enabled: true, ...editor } } },
    plugins,
  );
  return must(instance.feature('editor') as EditorService | undefined, 'editor service');
}

async function open(
  svc: EditorService,
  opts: EditorOptions = {},
): Promise<{ handle: EditorHandle; host: HTMLElement; area: HTMLElement }> {
  const host = document.createElement('div');
  document.body.append(host);
  const handle = await svc.create(host, opts);
  const area = must(host.querySelector<HTMLElement>('.tiptap'), '.tiptap');
  return { handle, host, area };
}

const paragraph = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

describe('content formats', () => {
  it('round-trips a document through HTML', async () => {
    const svc = await service();
    const json = {
      type: 'doc' as const,
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Plan' }] },
        paragraph('Ship it'),
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [paragraph('one')] }],
        },
      ],
    };
    const a = await open(svc, { content: json });
    const html = a.handle.getHTML();
    expect(html).toContain('<h2>Plan</h2>');
    const b = await open(svc, { content: html, format: 'html' });
    expect(b.handle.getText()).toBe(a.handle.getText());
    expect(b.handle.getJSON().content?.map((n) => n.type)).toEqual([
      'heading',
      'paragraph',
      'bulletList',
    ]);
  });

  it('imports and exports Markdown', async () => {
    const svc = await service();
    const { handle } = await open(svc, {
      content: '# Title\n\nSome **bold** text\n\n- a\n- b\n\n1. x\n2. y',
      format: 'markdown',
    });
    expect(handle.getJSON().content?.map((n) => n.type)).toEqual([
      'heading',
      'paragraph',
      'bulletList',
      'orderedList',
    ]);
    const md = handle.getMarkdown();
    expect(md).toContain('# Title');
    expect(md).toContain('**bold**');
    expect(md).toMatch(/^- a$/m);
    handle.setContent('- [ ] todo\n- [x] done', 'markdown');
    expect(handle.getJSON().content?.[0]?.type).toBe('taskList');
  });

  it('strips scripts and event handlers from imported HTML and from getHTML', async () => {
    const svc = await service();
    const { handle } = await open(svc, {
      content:
        '<p>ok</p><img src="x.png" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">l</a>',
      format: 'html',
    });
    const html = handle.getHTML();
    expect(html).toContain('ok');
    expect(html).not.toMatch(/onerror|<script|javascript:/);
  });

  it('rejects an invalid JSON document', async () => {
    const svc = await service();
    await expect(open(svc, { content: { type: 'paragraph' } as never })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('replaces content without adding an undo step', async () => {
    const svc = await service();
    const { handle } = await open(svc, { content: { type: 'doc', content: [paragraph('first')] } });
    handle.setContent({ type: 'doc', content: [paragraph('second')] });
    expect(handle.getText()).toBe('second');
    expect(handle.state.get().canUndo).toBe(false);
  });
});

describe('typing', () => {
  it('stops at maxLength', async () => {
    const svc = await service({ maxLength: 5 });
    const { handle, area } = await open(svc);
    await userEvent.click(area);
    await userEvent.keyboard('abcdefgh');
    expect(handle.getText()).toBe('abcde');
    expect(handle.state.get().characters).toBe(5);
  });

  it('reports changes once, 300 ms after the last edit, and on destroy', async () => {
    const svc = await service();
    const onChange = vi.fn();
    const { handle, area } = await open(svc, { onChange });
    await userEvent.click(area);
    await userEvent.keyboard('hello');
    expect(onChange).not.toHaveBeenCalled();
    await until(() => onChange.mock.calls.length > 0);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      text: 'hello',
      isEmpty: false,
      characters: 5,
    });

    await userEvent.keyboard('!');
    handle.destroy();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does not report programmatic setContent', async () => {
    const svc = await service();
    const onChange = vi.fn();
    const { handle } = await open(svc, { onChange });
    handle.setContent({ type: 'doc', content: [paragraph('x')] });
    await new Promise((r) => setTimeout(r, 450));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('turns Markdown shortcuts into formatting, unless they are switched off', async () => {
    const on = await open(await service());
    await userEvent.click(on.area);
    await userEvent.keyboard('# Heading');
    expect(on.handle.getJSON().content?.[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 1 },
    });

    const off = await open(await service({ markdownShortcuts: false }));
    await userEvent.click(off.area);
    await userEvent.keyboard('# Heading');
    expect(off.handle.getJSON().content?.[0]?.type).toBe('paragraph');
  });
});

describe('commands', () => {
  it('toggles marks and blocks and reports them as active', async () => {
    const svc = await service();
    const { handle, area } = await open(svc, {
      content: { type: 'doc', content: [paragraph('hello')] },
    });
    await userEvent.click(area);
    await userEvent.keyboard('{Control>}a{/Control}');
    handle.exec('bold');
    expect(handle.state.get().active.has('bold')).toBe(true);
    expect(JSON.stringify(handle.getJSON())).toContain('"bold"');
    handle.exec('bold');
    expect(handle.state.get().active.has('bold')).toBe(false);

    // A select-all spans the trailing empty paragraph Tiptap adds, so collapse the selection first.
    handle.focus('start');
    handle.exec('heading-2');
    expect(handle.state.get().active.has('heading-2')).toBe(true);
    handle.exec('bullet-list');
    expect(handle.getJSON().content?.[0]?.type).toBe('bulletList');
    handle.exec('align-center');
    handle.exec('clear');
    expect(handle.getJSON().content?.[0]?.type).toBe('paragraph');
  });

  it('undoes and redoes, and tells the toolbar when it can', async () => {
    const svc = await service();
    const { handle, area } = await open(svc);
    expect(handle.state.get().canUndo).toBe(false);
    await userEvent.click(area);
    await userEvent.keyboard('abc');
    expect(handle.state.get().canUndo).toBe(true);
    handle.exec('undo');
    expect(handle.getText()).toBe('');
    expect(handle.state.get().canRedo).toBe(true);
    handle.exec('redo');
    expect(handle.getText()).toBe('abc');
  });

  it('adds and removes links, and refuses unsafe schemes', async () => {
    const svc = await service();
    const { handle, area } = await open(svc, {
      content: { type: 'doc', content: [paragraph('site')] },
    });
    await userEvent.click(area);
    await userEvent.keyboard('{Control>}a{/Control}');
    handle.exec({ name: 'link', href: 'https://example.com' });
    expect(handle.getHTML()).toContain('href="https://example.com"');
    expect(handle.state.get().active.has('link')).toBe(true);
    handle.exec({ name: 'link', href: null });
    expect(handle.getHTML()).not.toContain('href');
    expect(() => handle.exec({ name: 'link', href: 'javascript:alert(1)' })).toThrowError(
      /not allowed/,
    );
  });

  it('inserts a table only when tables are enabled', async () => {
    const off = await open(await service());
    off.handle.exec('table');
    expect(JSON.stringify(off.handle.getJSON())).not.toContain('table');
    const on = await open(await service({ tables: true }));
    on.handle.exec('table');
    expect(on.handle.getJSON().content?.some((n) => n.type === 'table')).toBe(true);
  });

  it('highlights code blocks lazily', async () => {
    const { handle, host } = await open(await service(), {
      content: {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'javascript' },
            content: [{ type: 'text', text: 'const a = 1;' }],
          },
        ],
      },
    });
    await until(() => host.querySelector('.hljs-keyword'));
    expect(handle.getJSON().content?.[0]?.type).toBe('codeBlock');
  });

  it('can be made read only and back', async () => {
    const { handle, area } = await open(await service(), { readOnly: true });
    expect(area.getAttribute('contenteditable')).toBe('false');
    handle.setReadOnly(false);
    expect(area.getAttribute('contenteditable')).toBe('true');
  });
});

describe('slash menu', () => {
  it('filters blocks as you type and inserts the chosen one', async () => {
    const { handle, area } = await open(await service());
    await userEvent.click(area);
    await userEvent.keyboard('/head');
    const menu = await until(() => handle.slash.get());
    expect(menu.items.map((i) => i.id)).toEqual(['heading-1', 'heading-2', 'heading-3']);
    await userEvent.keyboard('{ArrowDown}');
    expect(handle.slash.get()?.selected).toBe(1);
    await userEvent.keyboard('{Enter}');
    expect(handle.slash.get()).toBeNull();
    await until(() => handle.getJSON().content?.[0]?.type === 'heading');
    expect(handle.getJSON().content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
    expect(handle.getText()).toBe('');
  });

  it('closes on Escape and can be clicked through pick()', async () => {
    const { handle, area } = await open(await service());
    await userEvent.click(area);
    await userEvent.keyboard('/');
    await until(() => handle.slash.get());
    await userEvent.keyboard('{Escape}');
    await until(() => handle.slash.get() === null);

    await userEvent.keyboard('{Backspace}/quote');
    await until(() => handle.slash.get()?.items.length === 1);
    handle.pick('slash', 0);
    expect(handle.getJSON().content?.[0]?.type).toBe('blockquote');
  });

  it('is off when slashCommands is false, and hides blocks that are not enabled', async () => {
    const off = await open(await service({ slashCommands: false }));
    await userEvent.click(off.area);
    await userEvent.keyboard('/');
    expect(off.handle.slash.get()).toBeNull();

    const noImages = await open(await service({ images: { enabled: false } }));
    await userEvent.click(noImages.area);
    await userEvent.keyboard('/');
    const menu = await until(() => noImages.handle.slash.get());
    expect(menu.items.map((i) => i.id)).not.toContain('image');
    expect(menu.items.map((i) => i.id)).not.toContain('table');
  });

  it('asks the host for a file when Image is chosen', async () => {
    const onRequestImage = vi.fn();
    const { handle, area } = await open(await service(), { onRequestImage });
    await userEvent.click(area);
    await userEvent.keyboard('/image');
    await until(() => handle.slash.get()?.items.length === 1);
    await userEvent.keyboard('{Enter}');
    expect(onRequestImage).toHaveBeenCalledOnce();
  });
});

describe('mentions', () => {
  it('searches as you type after @ and inserts the pick', async () => {
    const search = vi.fn(async (q: string) =>
      [
        { id: '1', label: 'Ada' },
        { id: '2', label: 'Alan' },
      ].filter((u) => u.label.toLowerCase().startsWith(q.toLowerCase())),
    );
    const { handle, area } = await open(await service({ mentions: { enabled: true } }), {
      mentions: { search },
    });
    await userEvent.click(area);
    await userEvent.keyboard('hi @al');
    const menu = await until(
      () => handle.mention.get()?.items.length === 1 && handle.mention.get(),
    );
    expect(menu.items[0]?.label).toBe('Alan');
    await userEvent.keyboard('{Enter}');
    expect(JSON.stringify(handle.getJSON())).toContain('"mention"');
    expect(handle.getText()).toBe('hi @Alan');
  });

  it('survives a failing provider', async () => {
    const { handle, area } = await open(await service({ mentions: { enabled: true } }), {
      mentions: { search: async () => Promise.reject(new Error('down')) },
    });
    await userEvent.click(area);
    await userEvent.keyboard('@a');
    const menu = await until(() => handle.mention.get());
    expect(menu.items).toEqual([]);
  });
});

describe('images', () => {
  const png = () =>
    new Blob(
      [
        Uint8Array.from(
          atob(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          ),
          (c) => c.charCodeAt(0),
        ),
      ],
      { type: 'image/png' },
    );

  it('uploads through the instance adapter and inserts the image', async () => {
    const { handle } = await open(await service());
    const result = await handle.insertImage(png(), 'dot.png');
    expect(result?.url).toMatch(/^data:image\//);
    const image = handle.getJSON().content?.find((n) => n.type === 'image');
    expect(image?.attrs).toMatchObject({ alt: 'dot.png' });
  });

  it('reports files that are too large, not images, or not allowed', async () => {
    const onUploadError = vi.fn();
    const { handle } = await open(await service({ images: { enabled: true, maxBytes: 10 } }), {
      onUploadError,
    });
    expect(await handle.insertImage(png())).toBeNull();
    expect(onUploadError.mock.calls[0]?.[0]).toMatchObject({ code: 'UPLOAD_TOO_LARGE' });
    expect(await handle.insertImage(new Blob(['x'], { type: 'text/plain' }))).toBeNull();
    expect(onUploadError.mock.calls[1]?.[0]).toMatchObject({ code: 'VALIDATION' });

    const off = await open(await service({ images: { enabled: false } }), { onUploadError });
    expect(await off.handle.insertImage(png())).toBeNull();
    expect(onUploadError).toHaveBeenCalledTimes(3);
  });

  it('handles pasted image files', async () => {
    const { handle, area } = await open(await service());
    await userEvent.click(area);
    const data = new DataTransfer();
    data.items.add(new File([png()], 'pasted.png', { type: 'image/png' }));
    area.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
    await until(() => handle.getJSON().content?.some((n) => n.type === 'image'));
  });
});

describe('static helpers', () => {
  it('renders and summarises a document without an editor', async () => {
    const svc = await service();
    const doc = { type: 'doc' as const, content: [paragraph('<b>x</b>')] };
    expect(svc.renderStatic(doc)).toBe('<p>&#60;b&#62;x&#60;/b&#62;</p>');
    expect(svc.toPlainText(doc)).toBe('<b>x</b>');
  });
});
