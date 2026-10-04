import { defineElement, registerImplicitPlugin } from '@tessera-kit/elements';
import '@tessera-kit/editor/elements';
import { TesseraNote } from './note.js';
import { TesseraNotesElement } from './notes.js';

export { TesseraNote } from './note.js';
export { TesseraNotesElement } from './notes.js';
export type { NotesView } from './view.js';

// Defining the tags and registering the loader is what lets a bare <tessera-notes> work on the
// implicit default instance, without any createTessera() call.
defineElement('tessera-note', TesseraNote);
defineElement('tessera-notes', TesseraNotesElement);
registerImplicitPlugin('notes', () => import('../plugin.js'));

declare global {
  interface HTMLElementTagNameMap {
    'tessera-notes': TesseraNotesElement;
    'tessera-note': TesseraNote;
  }
}
