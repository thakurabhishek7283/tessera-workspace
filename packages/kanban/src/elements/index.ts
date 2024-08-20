import { defineElement, registerImplicitPlugin } from '@tessera/elements';
import '@tessera/editor/elements';
import { TesseraKanbanElement } from './board.js';
import { TesseraKanbanCard } from './card.js';
import { TesseraKanbanCardDialog } from './card-dialog.js';
import { TesseraKanbanColumn } from './column.js';
import { TesseraKanbanFilters } from './filters.js';

export { TesseraKanbanElement } from './board.js';
export { TesseraKanbanCard } from './card.js';
export { TesseraKanbanCardDialog } from './card-dialog.js';
export { TesseraKanbanColumn } from './column.js';
export { TesseraKanbanFilters } from './filters.js';
export type { KanbanView } from './view.js';

// Defining the tags and registering the loader is what lets a bare <tessera-kanban> work on the
// implicit default instance, without any createTessera() call.
defineElement('tessera-kanban-card', TesseraKanbanCard);
defineElement('tessera-kanban-column', TesseraKanbanColumn);
defineElement('tessera-kanban-filters', TesseraKanbanFilters);
defineElement('tessera-kanban-card-dialog', TesseraKanbanCardDialog);
defineElement('tessera-kanban', TesseraKanbanElement);
registerImplicitPlugin('kanban', () => import('../plugin.js'));

declare global {
  interface HTMLElementTagNameMap {
    'tessera-kanban': TesseraKanbanElement;
    'tessera-kanban-card': TesseraKanbanCard;
    'tessera-kanban-column': TesseraKanbanColumn;
    'tessera-kanban-filters': TesseraKanbanFilters;
    'tessera-kanban-card-dialog': TesseraKanbanCardDialog;
  }
}
