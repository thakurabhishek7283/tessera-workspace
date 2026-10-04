import { TesseraError } from '@tessera-kit/core';
import DOMPurify from 'dompurify';

// Mirrors the nodes and marks the editor can produce; anything else is dropped.
const TAGS = [
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'code',
  'strong',
  'b',
  'em',
  'i',
  's',
  'del',
  'u',
  'mark',
  'a',
  'ul',
  'ol',
  'li',
  'input',
  'div',
  'span',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'colgroup',
  'col',
];
const ATTRS = [
  'href',
  'target',
  'rel',
  'src',
  'alt',
  'title',
  'width',
  'height',
  'class',
  'style',
  'type',
  'checked',
  'disabled',
  'data-type',
  'data-checked',
  'data-id',
  'data-label',
  'start',
  'colspan',
  'rowspan',
  'loading',
];

export interface SanitizeOptions {
  /** Schemes allowed in `href`. Default `http`, `https`, `mailto`. */
  protocols?: readonly string[];
  /** Keep images. Default true. */
  images?: boolean;
}

/** Strips scripts, event handlers and unknown markup from `html`. Needs a DOM (a browser or happy-dom). */
export function sanitizeHtml(html: string, options: SanitizeOptions = {}): string {
  if (!DOMPurify.isSupported) {
    throw new TesseraError('UNKNOWN', 'Sanitizing HTML needs a DOM, which is not available here');
  }
  const protocols = options.protocols ?? ['http', 'https', 'mailto'];
  const allowed = new RegExp(
    `^(?:(?:${protocols.join('|')}):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))`,
    'i',
  );
  const tags = options.images === false ? TAGS.filter((t) => t !== 'img') : TAGS;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: ATTRS,
    ALLOWED_URI_REGEXP: allowed,
    ALLOW_DATA_ATTR: false,
    // `style` survives only for text-align (checked again below).
    FORBID_ATTR: [],
  }).replace(/ style="(?!text-align:\s*(?:left|center|right|justify);?")[^"]*"/g, '');
}
