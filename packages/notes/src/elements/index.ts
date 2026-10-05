// Each tag is defined by its own module (`./tags/<tag>.js`, published as `elements/<tag>`), which
// also defines the elements it renders. Importing this entry defines the kit's elements.
import './tags/tessera-note.js';
import './tags/tessera-notes.js';
import type { TesseraNote } from './note.js';
import type { TesseraNotesElement } from './notes.js';

export { TesseraNote } from './note.js';
export { TesseraNotesElement } from './notes.js';
export type { NotesView } from './view.js';

declare global {
  interface HTMLElementTagNameMap {
    'tessera-notes': TesseraNotesElement;
    'tessera-note': TesseraNote;
  }
}
