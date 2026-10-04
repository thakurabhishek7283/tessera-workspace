// <tessera-kanban> and the elements it renders: `@tessera-kit/kanban/elements/tessera-kanban`.
import '../setup.js';
import './tessera-kanban-filters.js';
import './tessera-kanban-column.js';
import './tessera-kanban-card-dialog.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraKanbanElement } from '../board.js';

defineElement('tessera-kanban', TesseraKanbanElement);

export { TesseraKanbanElement };
