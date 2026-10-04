// <tessera-notes> and the elements it renders: `@tessera-kit/notes/elements/tessera-notes`.
import '../setup.js';
import './tessera-note.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraNotesElement } from '../notes.js';

defineElement('tessera-notes', TesseraNotesElement);

export { TesseraNotesElement };
