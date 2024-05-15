import { describe, expect, it } from 'vitest';
import {
  isRichDocEmpty,
  MAX_DEPTH,
  type RichDoc,
  RichDocSchema,
  richDocFromText,
  richDocIssue,
  toPlainText,
} from '../src/index.js';

const doc = (...content: RichDoc['content'] & unknown[]): RichDoc => ({ type: 'doc', content });
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('richDocFromText', () => {
  it('makes one paragraph per line and keeps blank lines', () => {
    expect(richDocFromText('a\n\nb')).toEqual(doc(p('a'), { type: 'paragraph' }, p('b')));
  });
});

describe('toPlainText', () => {
  it('joins blocks with newlines', () => {
    expect(toPlainText(doc(p('one'), p('two')))).toBe('one\ntwo');
  });

  it('flattens lists without blank lines between items', () => {
    const list = {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [p('x')] },
        { type: 'listItem', content: [p('y')] },
      ],
    };
    expect(toPlainText(doc(list))).toBe('x\ny');
  });

  it('keeps marks out of the text and expands hard breaks and mentions', () => {
    const d = doc({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'hi ', marks: [{ type: 'bold' }] },
        { type: 'mention', attrs: { id: '1', label: 'Ada' } },
        { type: 'hardBreak' },
        { type: 'text', text: 'there' },
      ],
    });
    expect(toPlainText(d)).toBe('hi @Ada\nthere');
  });

  it('separates table cells with tabs', () => {
    const cell = (t: string) => ({ type: 'tableCell', content: [p(t)] });
    const table = {
      type: 'table',
      content: [{ type: 'tableRow', content: [cell('a'), cell('b')] }],
    };
    expect(toPlainText(doc(table))).toBe('a\tb');
  });
});

describe('isRichDocEmpty', () => {
  it('treats missing, empty and blank documents as empty', () => {
    expect(isRichDocEmpty(undefined)).toBe(true);
    expect(isRichDocEmpty({ type: 'doc' })).toBe(true);
    expect(isRichDocEmpty(doc({ type: 'paragraph' }))).toBe(true);
  });

  it('counts text, images and rules as content', () => {
    expect(isRichDocEmpty(doc(p('x')))).toBe(false);
    expect(isRichDocEmpty(doc({ type: 'image', attrs: { src: 'a.png' } }))).toBe(false);
    expect(isRichDocEmpty(doc({ type: 'horizontalRule' }))).toBe(false);
  });
});

describe('RichDocSchema', () => {
  it('accepts a valid document', () => {
    expect(RichDocSchema.safeParse(doc(p('ok'))).success).toBe(true);
    expect(RichDocSchema.safeParse({ type: 'doc' }).success).toBe(true);
  });

  it.each([
    ['not an object', 'x', 'must be an object'],
    ['wrong root type', { type: 'paragraph' }, 'type must be "doc"'],
    ['content that is not an array', { type: 'doc', content: {} }, 'content must be an array'],
    ['a node without a type', { type: 'doc', content: [{}] }, 'node.type must be a string'],
    [
      'non-string text',
      { type: 'doc', content: [{ type: 'text', text: 1 }] },
      'node.text must be a string',
    ],
  ])('rejects %s', (_name, value, issue) => {
    expect(richDocIssue(value)).toBe(issue);
    expect(RichDocSchema.safeParse(value).success).toBe(false);
  });

  it('rejects documents nested too deeply', () => {
    let node: Record<string, unknown> = { type: 'text', text: 'x' };
    for (let i = 0; i < MAX_DEPTH + 1; i++) node = { type: 'blockquote', content: [node] };
    expect(richDocIssue(doc(node as never))).toMatch(/deeper than 20/);
  });

  it('rejects documents over 64 KB', () => {
    expect(richDocIssue(doc(p('x'.repeat(70_000))))).toMatch(/larger than 64 KB/);
  });
});
