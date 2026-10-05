// <tessera-editor> and the elements it renders: `@tessera-kit/editor/elements/tessera-editor`.
import '../setup.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraEditorElement } from '../editor.js';

defineElement('tessera-editor', TesseraEditorElement);

export { TesseraEditorElement };
