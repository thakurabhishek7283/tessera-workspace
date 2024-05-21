import type { RichDoc, RichNode } from './rich-doc.js';

const ALIGN = new Set(['left', 'center', 'right', 'justify']);
const IMAGE_DATA = /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]+$/i;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** True for a URL whose scheme is in `protocols`, or that has no scheme at all (relative). */
export function isSafeUrl(url: string, protocols: readonly string[]): boolean {
  const trimmed = url.trim();
  // Control characters and whitespace inside the scheme are a classic bypass (`java\tscript:`).
  const compact = [...trimmed].filter((c) => c.charCodeAt(0) > 32).join('');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  if (!scheme) return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  return protocols.includes((scheme[1] ?? '').toLowerCase());
}

/** True for `http(s)`, `blob:` and base64 raster `data:` image URLs, and relative paths. */
export const isSafeImage = (src: string): boolean =>
  IMAGE_DATA.test(src.trim()) || isSafeUrl(src, ['http', 'https', 'blob']);

export interface RenderOptions {
  /** URL schemes allowed in links. Default `http`, `https`, `mailto`. */
  protocols?: readonly string[];
}

const attr = (name: string, value: unknown): string =>
  value === undefined || value === null || value === ''
    ? ''
    : ` ${name}="${escapeHtml(String(value))}"`;

const alignStyle = (node: RichNode): string => {
  const align = node.attrs?.textAlign;
  return typeof align === 'string' && ALIGN.has(align) ? ` style="text-align:${align}"` : '';
};

/**
 * Renders a document to HTML without loading the editor. Text and attributes are escaped and
 * URLs are checked against an allow list, so the result is safe to assign to `innerHTML`.
 */
export function renderStatic(doc: RichDoc, options: RenderOptions = {}): string {
  const protocols = options.protocols ?? ['http', 'https', 'mailto'];

  const marks = (text: string, node: RichNode): string => {
    let out = escapeHtml(text);
    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case 'bold':
          out = `<strong>${out}</strong>`;
          break;
        case 'italic':
          out = `<em>${out}</em>`;
          break;
        case 'strike':
          out = `<s>${out}</s>`;
          break;
        case 'underline':
          out = `<u>${out}</u>`;
          break;
        case 'code':
          out = `<code>${out}</code>`;
          break;
        case 'highlight':
          out = `<mark>${out}</mark>`;
          break;
        case 'link': {
          const href = String(mark.attrs?.href ?? '');
          if (isSafeUrl(href, protocols)) {
            out = `<a${attr('href', href)} target="_blank" rel="noopener noreferrer nofollow">${out}</a>`;
          }
          break;
        }
      }
    }
    return out;
  };

  const children = (node: RichNode): string => (node.content ?? []).map(render).join('');

  const render = (node: RichNode): string => {
    switch (node.type) {
      case 'text':
        return marks(node.text ?? '', node);
      case 'paragraph':
        return `<p${alignStyle(node)}>${children(node)}</p>`;
      case 'heading': {
        const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
        return `<h${level}${alignStyle(node)}>${children(node)}</h${level}>`;
      }
      case 'blockquote':
        return `<blockquote>${children(node)}</blockquote>`;
      case 'bulletList':
        return `<ul>${children(node)}</ul>`;
      case 'orderedList': {
        const start = Number(node.attrs?.start);
        return `<ol${start > 1 ? attr('start', start) : ''}>${children(node)}</ol>`;
      }
      case 'listItem':
        return `<li>${children(node)}</li>`;
      case 'taskList':
        return `<ul data-type="taskList">${children(node)}</ul>`;
      case 'taskItem': {
        const checked = node.attrs?.checked === true;
        return `<li data-type="taskItem" data-checked="${checked}"><input type="checkbox" disabled${checked ? ' checked' : ''}><div>${children(node)}</div></li>`;
      }
      case 'codeBlock': {
        const language = String(node.attrs?.language ?? '').replace(/[^\w+#-]/g, '');
        return `<pre><code${language ? ` class="language-${language}"` : ''}>${children(node)}</code></pre>`;
      }
      case 'horizontalRule':
        return '<hr>';
      case 'hardBreak':
        return '<br>';
      case 'image': {
        const src = String(node.attrs?.src ?? '');
        if (!isSafeImage(src)) return '';
        return `<img${attr('src', src)}${attr('alt', node.attrs?.alt)}${attr('title', node.attrs?.title)} loading="lazy">`;
      }
      case 'table':
        return `<table><tbody>${children(node)}</tbody></table>`;
      case 'tableRow':
        return `<tr>${children(node)}</tr>`;
      case 'tableHeader':
      case 'tableCell': {
        const tag = node.type === 'tableHeader' ? 'th' : 'td';
        const span = (name: string, v: unknown): string =>
          Number(v) > 1 ? attr(name, Number(v)) : '';
        return `<${tag}${span('colspan', node.attrs?.colspan)}${span('rowspan', node.attrs?.rowspan)}>${children(node)}</${tag}>`;
      }
      case 'mention':
        return `<span class="mention" data-id="${escapeHtml(String(node.attrs?.id ?? ''))}">@${escapeHtml(String(node.attrs?.label ?? node.attrs?.id ?? ''))}</span>`;
      default:
        // Unknown nodes (from a newer schema) still show their text instead of vanishing.
        return children(node);
    }
  };

  return (doc.content ?? []).map(render).join('');
}
