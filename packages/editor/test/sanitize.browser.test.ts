import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../src/index.js';

describe('sanitizeHtml', () => {
  it('removes scripts, event handlers and iframes', () => {
    const out = sanitizeHtml(
      '<p onclick="x()">hi<script>alert(1)</script><img src="a.png" onerror="alert(1)"><iframe src="//e"></iframe></p>',
    );
    expect(out).not.toMatch(/script|onclick|onerror|iframe/);
    expect(out).toContain('<p>hi');
  });

  it('removes javascript: links but keeps allowed ones', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript');
    expect(sanitizeHtml('<a href="https://a.test">x</a>')).toContain('href="https://a.test"');
    expect(sanitizeHtml('<a href="ftp://a.test">x</a>')).not.toContain('href');
  });

  it('honours a custom protocol list', () => {
    expect(sanitizeHtml('<a href="mailto:a@b.test">x</a>', { protocols: ['https'] })).not.toContain(
      'mailto',
    );
  });

  it('keeps formatting the editor produces', () => {
    const html =
      '<h2>T</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><div>a</div></li></ul>';
    expect(sanitizeHtml(html)).toContain('data-type="taskList"');
  });

  it('drops images when they are turned off', () => {
    expect(sanitizeHtml('<p><img src="a.png"></p>', { images: false })).not.toContain('img');
  });

  it('allows text-align styles only', () => {
    const out = sanitizeHtml('<p style="text-align:center">a</p><p style="position:fixed">b</p>');
    expect(out).toContain('text-align:center');
    expect(out).not.toContain('position');
  });
});
