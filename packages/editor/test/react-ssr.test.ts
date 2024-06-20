import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Editor, RichText } from '../src/react/index.js';

describe('React bindings on the server', () => {
  it('render empty custom element tags with their attributes', () => {
    const html = renderToString(
      createElement(Editor, {
        placeholder: 'Write',
        readonly: true,
        className: 'x',
        toolbar: 'bold',
      }),
    );
    expect(html).toMatch(/^<tessera-editor/);
    expect(html).toContain('placeholder="Write"');
    expect(html).toContain('readonly=""');
    expect(html).toContain('class="x"');
    expect(html).toContain('toolbar="bold"');
  });

  it('never touch the DOM or define elements', () => {
    expect(typeof customElements).toBe('undefined');
    expect(renderToString(createElement(RichText, {}))).toBe(
      '<tessera-rich-text></tessera-rich-text>',
    );
  });

  it('leave out attributes that are false or undefined', () => {
    const html = renderToString(createElement(Editor, { readonly: false, required: undefined }));
    expect(html).not.toContain('readonly');
    expect(html).not.toContain('required');
  });
});
