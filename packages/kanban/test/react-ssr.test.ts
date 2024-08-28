import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Kanban } from '../src/react/index.js';

describe('React bindings on the server', () => {
  it('render an empty tag with attributes and never touch the DOM', () => {
    expect(typeof customElements).toBe('undefined');
    const html = renderToString(
      createElement(Kanban, { board: 'roadmap', readonly: true, className: 'k' }),
    );
    expect(html).toMatch(/^<tessera-kanban/);
    expect(html).toContain('board="roadmap"');
    expect(html).toContain('readonly=""');
    expect(html).toContain('class="k"');
    expect(html).not.toContain('tessera-kanban-column');
  });
});
