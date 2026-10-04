import * as z from 'zod/mini';

/** One ProseMirror/Tiptap node in its JSON form. */
export interface RichNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

/** The persisted format of rich text: Tiptap/ProseMirror JSON. */
export interface RichDoc {
  type: 'doc';
  content?: RichNode[];
}

export const MAX_DEPTH = 20;
export const MAX_BYTES = 64 * 1024;

const encoder = new TextEncoder();

/** What is wrong with `value` as a {@link RichDoc}, or `null` when it is fine. */
export function richDocIssue(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return 'must be an object';
  const doc = value as { type?: unknown; content?: unknown };
  if (doc.type !== 'doc') return 'type must be "doc"';
  if (doc.content !== undefined && !Array.isArray(doc.content)) return 'content must be an array';

  const check = (node: unknown, depth: number): string | null => {
    if (depth > MAX_DEPTH) return `nested deeper than ${MAX_DEPTH} levels`;
    if (typeof node !== 'object' || node === null || Array.isArray(node))
      return 'node must be an object';
    const n = node as RichNode;
    if (typeof n.type !== 'string' || n.type === '') return 'node.type must be a string';
    if (n.text !== undefined && typeof n.text !== 'string') return 'node.text must be a string';
    if (n.content !== undefined) {
      if (!Array.isArray(n.content)) return 'node.content must be an array';
      for (const child of n.content) {
        const issue = check(child, depth + 1);
        if (issue) return issue;
      }
    }
    return null;
  };
  for (const child of (doc.content as unknown[] | undefined) ?? []) {
    const issue = check(child, 1);
    if (issue) return issue;
  }
  if (encoder.encode(JSON.stringify(value)).length > MAX_BYTES) {
    return `larger than ${MAX_BYTES / 1024} KB`;
  }
  return null;
}

/** Structural check: a `doc` node, at most {@link MAX_DEPTH} levels deep and {@link MAX_BYTES} long. */
export const RichDocSchema: z.ZodMiniType<RichDoc> = z.custom<RichDoc>(
  (value) => richDocIssue(value) === null,
  'must be a rich text document (a "doc" node, at most 20 levels deep and 64 KB)',
);

/**
 * Drops `null` attributes (Tiptap fills every optional attribute, e.g. `textAlign: null`), so the
 * stored form stays small and diffs stay readable. Returns a new object.
 */
export function compactRichDoc(doc: RichDoc): RichDoc {
  const clean = (node: RichNode): RichNode => {
    const out: RichNode = { ...node };
    if (node.attrs) {
      const attrs = Object.fromEntries(
        Object.entries(node.attrs).filter(([, v]) => v !== null && v !== undefined),
      );
      if (Object.keys(attrs).length) out.attrs = attrs;
      else delete out.attrs;
    }
    if (node.content) out.content = node.content.map(clean);
    if (node.marks) {
      out.marks = node.marks.map((m) => {
        if (!m.attrs) return m;
        const attrs = Object.fromEntries(
          Object.entries(m.attrs).filter(([, v]) => v !== null && v !== undefined),
        );
        return Object.keys(attrs).length ? { ...m, attrs } : { type: m.type };
      });
    }
    return out;
  };
  return { ...doc, ...(doc.content ? { content: doc.content.map(clean) } : {}) };
}

/** A document with one paragraph per line of `text`. */
export function richDocFromText(text: string): RichDoc {
  const lines = text.split(/\r?\n/);
  return {
    type: 'doc',
    content: lines.map((line) =>
      line === ''
        ? { type: 'paragraph' }
        : { type: 'paragraph', content: [{ type: 'text', text: line }] },
    ),
  };
}

const BLOCKS = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'taskItem',
  'tableRow',
  'horizontalRule',
]);

/** Plain text of a document, with one line per block. For previews and search. */
export function toPlainText(doc: RichDoc): string {
  const lines: string[] = [];
  let line = '';
  const flush = (): void => {
    lines.push(line);
    line = '';
  };
  const walk = (node: RichNode): void => {
    if (node.type === 'text') {
      line += node.text ?? '';
      return;
    }
    if (node.type === 'hardBreak') {
      line += '\n';
      return;
    }
    if (node.type === 'mention') {
      line += `@${String(node.attrs?.label ?? node.attrs?.id ?? '')}`;
      return;
    }
    if (node.type === 'tableRow') {
      // One line per row, cells separated by tabs.
      if (line !== '') flush();
      line = (node.content ?? [])
        .map((cell) =>
          toPlainText({ type: 'doc', content: cell.content ?? [] }).replace(/\n/g, ' '),
        )
        .join('\t');
      flush();
      return;
    }
    const block = BLOCKS.has(node.type);
    // A block that only holds other blocks (a list item around a paragraph) must not add a blank line.
    const holdsBlocks = node.content?.some((c) => BLOCKS.has(c.type) || c.type.endsWith('List'));
    if (block && line !== '' && !holdsBlocks) flush();
    for (const child of node.content ?? []) walk(child);
    if (block && !holdsBlocks) flush();
  };
  for (const node of doc.content ?? []) walk(node);
  if (line !== '') flush();
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** True when the document has no text and no non-text content such as images or rules. */
export function isRichDocEmpty(doc: RichDoc | null | undefined): boolean {
  if (!doc?.content?.length) return true;
  const hasContent = (node: RichNode): boolean => {
    if (node.type === 'text') return (node.text ?? '') !== '';
    if (node.type === 'image' || node.type === 'horizontalRule' || node.type === 'mention')
      return true;
    return node.content?.some(hasContent) ?? false;
  };
  return !doc.content.some(hasContent);
}
