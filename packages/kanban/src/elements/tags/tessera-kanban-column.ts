// <tessera-kanban-column> and the elements it renders: `@tessera-kit/kanban/elements/tessera-kanban-column`.
import '../setup.js';
import './tessera-kanban-card.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraKanbanColumn } from '../column.js';

defineElement('tessera-kanban-column', TesseraKanbanColumn);

export { TesseraKanbanColumn };
