# @tessera-kit/kanban

A Kanban board for the [Tessera](https://github.com/thakurabhishek7283/tessera) kit family: boards, columns, cards with rich descriptions, labels, assignees, due dates and checklists, with drag and drop that works with a mouse, a finger and the keyboard.

- Drag and drop by pointer, touch or keyboard (Space to lift, arrows to move, Space to drop), with live announcements for screen readers
- WIP limits per column, enforced in the UI and in the controller
- Card dialog with a rich description ([`@tessera-kit/editor`](../editor/README.md)), labels, assignees, due date and checklist
- Search and filters (text, label, assignee, due this week or overdue)
- Undo and redo for every change, including moves, deletes and edits
- Capability switches: turn off creating, moving, renaming or deleting without touching the UI code
- Cancelable `card-move` and `card-delete` events and a `beforeCardMove` hook to veto changes
- Live sync between tabs; optimistic saves that re-apply after a conflicting write
- Import and export boards as JSON
- Light and dark themes; English and German

## Install

```sh
pnpm add @tessera-kit/kanban @tessera-kit/editor @tessera-kit/core @tessera-kit/elements
```

`@tessera-kit/storage` is optional: without it the implicit default instance keeps data in the browser. The packages are not published to npm yet; see the [repository README](../../README.md) for building from source.

## Use

### Web component

```html
<script type="module">
  import '@tessera-kit/kanban/elements';
</script>

<tessera-kanban></tessera-kanban>
```

Without a `board` attribute the element shows a board picker with a "create board" form.

```js
const board = document.querySelector('tessera-kanban');
board.members = [{ id: 'u1', name: 'Ada Lovelace' }];
board.addEventListener('card-move', (e) => {
  if (e.detail.toColumnId === 'archive') e.preventDefault(); // cancelable
});
```

### React

```tsx
import { Kanban, useKanbanBoard } from '@tessera-kit/kanban/react';

<Kanban
  board={boardId}
  members={members}
  beforeCardMove={async (card, toColumnId) => canMove(card, toColumnId)}
  onCardOpen={(e) => console.log(e.detail.card)}
/>;
```

### With other kits

```ts
import { createTessera } from '@tessera-kit/core';

const tessera = createTessera(
  {
    storage: { type: 'indexeddb' },
    features: { editor: { enabled: true }, kanban: { enabled: true, wipLimits: true } },
  },
  { plugins: { editor: () => import('@tessera-kit/editor'), kanban: () => import('@tessera-kit/kanban') } },
);
tessera.on('kanban:card-moved', ({ card, toColumnId }) => console.log(card.title, '→', toColumnId));
```

### Headless

```ts
const api = tessera.features.kanban;
const board = await api.createBoard({ title: 'Launch plan' });
const controller = await api.open(board.id);
const [todo, , done] = controller.state.get().columns;
const card = await controller.addCard(todo.id, { title: 'Write the docs' });
await controller.moveCard(card.id, done.id, 0);
await controller.history.undo();
```

## Entry points

| Import | What it does |
| --- | --- |
| `@tessera-kit/kanban/elements` | Defines every kanban element, and the editor elements that show card descriptions. |
| `@tessera-kit/kanban/elements/<tag>` | Defines one element and the ones it renders, for importing exactly what a page uses: `tessera-kanban`, `tessera-kanban-card`, `tessera-kanban-card-dialog`, `tessera-kanban-column`, `tessera-kanban-filters`. |
| `@tessera-kit/kanban/autoload` | Only registers the tags (137 B gzip). Each element downloads the first time it appears on the page, which suits plain HTML pages. |
| `@tessera-kit/kanban` | The headless API and the plugin, without elements. |
| `@tessera-kit/kanban/react` | React components. |

```html
<script type="module">
  import '@tessera-kit/kanban/autoload';
</script>
```

## Configuration

<!-- config:start -->

| Option | Type | Default | Description |
|---|---|---|---|
| `defaultColumns` | `string[]` | `["To do","In progress","Done"]` | Columns created with a new board. |
| `allow` | `object` | `{"createBoard":true,"createColumn":true,"renameColumn":tr…` | Capability switches. The UI hides what is off and the controller refuses it. |
| `allow.createBoard` | `boolean` | `true` |  |
| `allow.createColumn` | `boolean` | `true` |  |
| `allow.renameColumn` | `boolean` | `true` |  |
| `allow.deleteColumn` | `boolean` | `true` |  |
| `allow.reorderColumns` | `boolean` | `true` |  |
| `allow.createCard` | `boolean` | `true` |  |
| `allow.deleteCard` | `boolean` | `true` |  |
| `allow.moveCard` | `boolean` | `true` |  |
| `cardFields` | `Array<"description" \| "labels" \| "assignees" \| … (8 values)>` | `["description","labels","assignees","dueDate","checklist"]` | Fields shown in the card dialog. |
| `customFields` | `object[]` | `[]` | Extra fields defined by the host. |
| `wipLimits` | `boolean` | `true` | Enforce column work-in-progress limits (moves into a full column are refused). |
| `filters` | `boolean` | `true` | Show the filter bar. |
| `density` | `"comfortable" \| "compact"` | `"comfortable"` | Card spacing. |
| `sync` | `"none" \| "live"` | `"live"` | `live` applies changes made in other tabs or by other users as they happen. |

<!-- config:end -->

## Element reference

### `<tessera-kanban>`

| Attribute / property | Description |
|---|---|
| `board` | Id of the board to show; leave out for the picker |
| `readonly` | Hides every control that changes data |
| `members` | `UserInfo[]` available as assignees |
| `beforeCardMove` | `(card, toColumnId) => boolean \| Promise<boolean>`; return `false` to refuse |
| `renderCardFooter` | `(card) => TemplateResult` for extra content at the bottom of each card |

| Event | Detail |
|---|---|
| `card-create` | `{ card }` after a card was added |
| `card-update` | `{ card, patch }` after a card was edited |
| `card-move` | `{ card, fromColumnId, toColumnId, toIndex }` before a drag or keyboard move; **cancelable** |
| `card-open` | `{ card }` when the card dialog opens |
| `card-delete` | `{ card }` before a card is deleted from the UI; **cancelable** |

Bus events (`instance.on(...)`): `kanban:board-created`, `kanban:card-created`, `kanban:card-updated`, `kanban:card-moved`, `kanban:card-deleted`, `kanban:column-created`, `kanban:column-updated`, `kanban:column-moved`, `kanban:column-deleted`, `kanban:move-blocked` (a WIP limit or a veto refused a move), `kanban:conflict`.

| CSS part | Element |
|---|---|
| `board`, `column`, `column-header`, `card`, `add-card`, `filters` | The main building blocks |
| `title`, `labels`, `meta` | Inside a card |

| Slot | Content |
|---|---|
| `toolbar-end` | Extra controls at the end of the toolbar |
| `empty` | Shown when the board has no columns |

Custom properties: `--tessera-kanban-column-width`, plus the shared `--tessera-*` design tokens.

### Keyboard

| Keys | Action |
|---|---|
| `Space`, arrows, `Space` | Lift a card, move it, drop it (`Escape` cancels) |
| `Enter` | Open the focused card |
| `Delete` | Delete the focused card (undo brings it back) |
| `n` | New card in the current column |
| `/` | Focus the search box |
| `Ctrl/⌘ + Z`, `Ctrl/⌘ + Shift + Z` | Undo, redo |

## Controller API

`KanbanApi`: `listBoards()`, `createBoard()`, `open(boardId)`, `configure({ members, beforeCardMove })`.

`BoardController`: `state` and `history` stores; `getCard`, `getColumn`; `addColumn`, `renameColumn`, `moveColumn`, `deleteColumn`, `setWipLimit`, `updateColumn`; `addCard`, `updateCard`, `moveCard`, `deleteCard`, `archiveCard`; `addLabel`, `updateLabel`, `deleteLabel`; `renameBoard`; `setFilter`; `exportJSON`, `importJSON(data, 'replace' | 'merge')`; `close`.

`moveCard(id, toColumnId, toIndex)` resolves to `false` when a WIP limit or `beforeCardMove` refused the move.
