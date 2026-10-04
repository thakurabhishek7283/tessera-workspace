// Each tag is defined by its own module (`./tags/<tag>.js`, published as `elements/<tag>`), which
// also defines the elements it renders. Importing this entry defines the kit's elements.
import './tags/tessera-editor.js';
import './tags/tessera-rich-text.js';
import type { TesseraEditorElement } from './editor.js';
import type { TesseraRichText } from './rich-text.js';

export { TesseraEditorElement } from './editor.js';
export { TesseraRichText } from './rich-text.js';
export { proseStyles } from './styles.js';

declare global {
  interface HTMLElementTagNameMap {
    'tessera-editor': TesseraEditorElement;
    'tessera-rich-text': TesseraRichText;
  }
}
