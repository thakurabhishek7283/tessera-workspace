import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Notes } from '../src/react/index.js';

describe('React bindings on the server', () => {
  it('render an empty tag with attributes and never touch the DOM', () => {
    expect(typeof customElements).toBe('undefined');
    const html = renderToString(
      createElement(Notes, { board: 'ideas', readonly: true, className: 'n' }),
    );
    expect(html).toMatch(/^<tessera-notes/);
    expect(html).toContain('board="ideas"');
    expect(html).toContain('readonly=""');
    expect(html).toContain('class="n"');
    expect(html).not.toContain('tessera-note ');
  });
});
