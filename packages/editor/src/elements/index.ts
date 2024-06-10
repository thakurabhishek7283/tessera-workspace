import { defineElement, registerImplicitPlugin } from '@tessera/elements';
import './icons.js';
import { TesseraEditorElement } from './editor.js';
import { TesseraRichText } from './rich-text.js';

export { TesseraEditorElement } from './editor.js';
export { TesseraRichText } from './rich-text.js';
export { proseStyles } from './styles.js';

// Defining the tags and registering the loader is what lets a bare <tessera-editor> work on the
// implicit default instance, without any createTessera() call.
defineElement('tessera-editor', TesseraEditorElement);
defineElement('tessera-rich-text', TesseraRichText);
registerImplicitPlugin('editor', () => import('../plugin.js'));

declare global {
  interface HTMLElementTagNameMap {
    'tessera-editor': TesseraEditorElement;
    'tessera-rich-text': TesseraRichText;
  }
}
