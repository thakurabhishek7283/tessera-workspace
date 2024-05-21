import { describe, expect, it } from 'vitest';
import { isSafeImage, isSafeUrl, type RichDoc, renderStatic } from '../src/index.js';

const doc = (...content: NonNullable<RichDoc['content']>): RichDoc => ({ type: 'doc', content });
const text = (t: string, marks: Array<{ type: string; attrs?: Record<string, unknown> }> = []) => ({
  type: 'text',
  text: t,
  ...(marks.length ? { marks } : {}),
});

describe('renderStatic', () => {
  it('renders blocks and marks', () => {
    const html = renderStatic(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [text('Title')] },
        {
          type: 'paragraph',
          content: [text('a', [{ type: 'bold' }, { type: 'italic' }]), text(' b')],
        },
      ),
    );
    expect(html).toBe('<h2>Title</h2><p><em><strong>a</strong></em> b</p>');
  });

  it('escapes text so markup cannot be injected', () => {
    const html = renderStatic(
      doc({ type: 'paragraph', content: [text('<img src=x onerror=alert(1)>')] }),
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&#60;img');
  });

  it('drops links with unsafe schemes and keeps the text', () => {
    const html = renderStatic(
      doc({
        type: 'paragraph',
        content: [text('click', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])],
      }),
    );
    expect(html).toBe('<p>click</p>');
  });

  it('adds rel and target to allowed links', () => {
    const html = renderStatic(
      doc({
        type: 'paragraph',
        content: [
          text('site', [{ type: 'link', attrs: { href: 'https://example.com/?a=1&b=2' } }]),
        ],
      }),
    );
    expect(html).toContain('href="https://example.com/?a=1&#38;b=2"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('renders lists, task items, code blocks and rules', () => {
    const html = renderStatic(
      doc(
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('x')] }] }],
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [{ type: 'paragraph', content: [text('done')] }],
            },
          ],
        },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1')] },
        { type: 'horizontalRule' },
      ),
    );
    expect(html).toContain('<ol start="3"><li><p>x</p></li></ol>');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('<pre><code class="language-ts">const a = 1</code></pre>');
    expect(html).toContain('<hr>');
  });

  it('only emits whitelisted text alignment', () => {
    expect(renderStatic(doc({ type: 'paragraph', attrs: { textAlign: 'center' } }))).toBe(
      '<p style="text-align:center"></p>',
    );
    expect(renderStatic(doc({ type: 'paragraph', attrs: { textAlign: 'center;color:red' } }))).toBe(
      '<p></p>',
    );
  });

  it('skips images with unsafe sources and keeps safe ones', () => {
    expect(renderStatic(doc({ type: 'image', attrs: { src: 'javascript:alert(1)' } }))).toBe('');
    expect(renderStatic(doc({ type: 'image', attrs: { src: 'data:text/html;base64,AAAA' } }))).toBe(
      '',
    );
    expect(
      renderStatic(doc({ type: 'image', attrs: { src: 'https://x.test/a.png', alt: 'A "pic"' } })),
    ).toBe('<img src="https://x.test/a.png" alt="A &#34;pic&#34;" loading="lazy">');
  });

  it('shows the text of unknown nodes instead of dropping it', () => {
    expect(
      renderStatic(
        doc({ type: 'callout', content: [{ type: 'paragraph', content: [text('hey')] }] }),
      ),
    ).toBe('<p>hey</p>');
  });

  it('renders mentions and tables', () => {
    const cell = (t: string, type = 'tableCell') => ({
      type,
      content: [{ type: 'paragraph', content: [text(t)] }],
    });
    const html = renderStatic(
      doc(
        { type: 'paragraph', content: [{ type: 'mention', attrs: { id: 'u1', label: 'Ada' } }] },
        {
          type: 'table',
          content: [{ type: 'tableRow', content: [cell('h', 'tableHeader'), cell('c')] }],
        },
      ),
    );
    expect(html).toContain('<span class="mention" data-id="u1">@Ada</span>');
    expect(html).toContain(
      '<table><tbody><tr><th><p>h</p></th><td><p>c</p></td></tr></tbody></table>',
    );
  });
});

describe('isSafeUrl', () => {
  const protocols = ['http', 'https', 'mailto'];
  it.each([
    ['https://a.test', true],
    ['mailto:a@b.test', true],
    ['/relative/path', true],
    ['#anchor', true],
    ['javascript:alert(1)', false],
    ['JaVaScRiPt:alert(1)', false],
    ['java\tscript:alert(1)', false],
    [' \u0001javascript:alert(1)', false],
    ['data:text/html,<script>', false],
    ['ftp://a.test', false],
  ])('%s → %s', (url, ok) => {
    expect(isSafeUrl(url, protocols)).toBe(ok);
  });
});

describe('isSafeImage', () => {
  it('accepts raster data URLs and rejects svg and html', () => {
    expect(isSafeImage('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isSafeImage('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isSafeImage('blob:https://a.test/1')).toBe(true);
  });
});
