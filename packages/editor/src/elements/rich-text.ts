import { baseStyles, TesseraElement } from '@tessera/elements';
import { type CSSResultGroup, css, html, type PropertyDeclarations } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderStatic } from '../render.js';
import type { RichDoc } from '../rich-doc.js';
import { proseStyles } from './styles.js';

/**
 * Read-only display of a rich text document. It never loads the editor: the document is turned
 * into escaped HTML by {@link renderStatic}.
 *
 * @example <tessera-rich-text .doc=${card.description}></tessera-rich-text>
 * @csspart content - the rendered document
 */
export class TesseraRichText extends TesseraElement {
  static override properties: PropertyDeclarations = { doc: { attribute: false } };
  static override styles: CSSResultGroup = [
    baseStyles,
    proseStyles,
    css`
      :host {
        display: block;
      }
    `,
  ];

  protected readonly featureId: string | null = null;
  doc: RichDoc | undefined;

  protected override render(): unknown {
    return html`<div class="prose" part="content">${unsafeHTML(this.doc ? renderStatic(this.doc) : '')}</div>`;
  }
}
