// Plain HTML: <script type="module" src="…/@tessera-kit/kanban/autoload"></script> registers every tag of
// the kit, and each one downloads the first time an element with that tag appears.
import { lazyDefine } from '@tessera-kit/elements';

lazyDefine('tessera-kanban-card', () => import('./elements/tags/tessera-kanban-card.js'));
lazyDefine('tessera-kanban-column', () => import('./elements/tags/tessera-kanban-column.js'));
lazyDefine('tessera-kanban-filters', () => import('./elements/tags/tessera-kanban-filters.js'));
lazyDefine(
  'tessera-kanban-card-dialog',
  () => import('./elements/tags/tessera-kanban-card-dialog.js'),
);
lazyDefine('tessera-kanban', () => import('./elements/tags/tessera-kanban.js'));
