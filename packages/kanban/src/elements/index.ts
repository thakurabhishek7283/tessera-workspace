// Each tag is defined by its own module (`./tags/<tag>.js`, published as `elements/<tag>`), which
// also defines the elements it renders. Importing this entry defines the kit's elements.
import './tags/tessera-kanban-card.js';
import './tags/tessera-kanban-column.js';
import './tags/tessera-kanban-filters.js';
import './tags/tessera-kanban-card-dialog.js';
import './tags/tessera-kanban.js';
import type { TesseraKanbanElement } from './board.js';
import type { TesseraKanbanCard } from './card.js';
import type { TesseraKanbanCardDialog } from './card-dialog.js';
import type { TesseraKanbanColumn } from './column.js';
import type { TesseraKanbanFilters } from './filters.js';

export { TesseraKanbanElement } from './board.js';
export { TesseraKanbanCard } from './card.js';
export { TesseraKanbanCardDialog } from './card-dialog.js';
export { TesseraKanbanColumn } from './column.js';
export { TesseraKanbanFilters } from './filters.js';
export type { KanbanView } from './view.js';

declare global {
  interface HTMLElementTagNameMap {
    'tessera-kanban': TesseraKanbanElement;
    'tessera-kanban-card': TesseraKanbanCard;
    'tessera-kanban-column': TesseraKanbanColumn;
    'tessera-kanban-filters': TesseraKanbanFilters;
    'tessera-kanban-card-dialog': TesseraKanbanCardDialog;
  }
}
