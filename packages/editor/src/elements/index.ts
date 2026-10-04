import { defineElement, registerImplicitPlugin } from '@tessera-kit/elements';
import { TesseraEditorElement } from './editor.js';
import { registerEditorIcons } from './icons.js';
import { TesseraRichText } from './rich-text.js';

export { TesseraEditorElement } from './editor.js';
export { TesseraRichText } from './rich-text.js';
export { proseStyles } from './styles.js';

// Defining the tags and registering the loader is what lets a bare <tessera-editor> work on the
// implicit default instance, without any createTessera() call.
registerEditorIcons();
defineElement('tessera-editor', TesseraEditorElement);
defineElement('tessera-rich-text', TesseraRichText);
registerImplicitPlugin('editor', () => import('../plugin.js'));

declare global {
  interface HTMLElementTagNameMap {
    'tessera-editor': TesseraEditorElement;
    'tessera-rich-text': TesseraRichText;
  }
}
