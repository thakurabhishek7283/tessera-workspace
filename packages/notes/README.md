# @tessera-kit/notes

Sticky notes for the [Tessera](https://github.com/thakurabhishek7283/tessera) kit family, on a responsive grid or a free canvas. Notes are edited with [`@tessera-kit/editor`](../editor/README.md).

- Grid layout with pinned notes first, or a free canvas with drag, resize and bring-to-front (all by keyboard too)
- Seven colours, tags, pinning, archive and restore
- Search that ignores case and accents, tag filter, "show archived"
- Undo and redo for create, edit, move, resize, colour, pin, archive and delete; quick edits merge into one step
- Live sync between tabs and optimistic saves that survive a conflicting write
- Keyboard operable, labelled, announced; light and dark themes; English and German

## Install

```sh
pnpm add @tessera-kit/notes @tessera-kit/editor @tessera-kit/core @tessera-kit/elements
```

The packages are not published to npm yet; see the [repository README](../../README.md) for building from source.

## Use

### Web component

```html
<script type="module">
  import '@tessera-kit/notes/elements';
</script>

<tessera-notes></tessera-notes>
```

### React

```tsx
import { Notes, useNotesBoard } from '@tessera-kit/notes/react';

<Notes board="ideas" onNoteCreate={(e) => console.log(e.detail.note)} />;

const { state, controller } = useNotesBoard('ideas'); // for a custom UI
```

### Headless

```ts
const tessera = createTessera(
  { features: { editor: { enabled: true }, notes: { enabled: true, layout: 'free' } } },
  { plugins: { editor: () => import('@tessera-kit/editor'), notes: () => import('@tessera-kit/notes') } },
);
await tessera.ready;
const board = await tessera.features.notes.open('ideas');
const note = await board.create({ color: 'yellow', tags: ['today'] });
await board.move(note.id, 40, 80);
await board.history.undo();
```

## Entry points

| Import | What it does |
| --- | --- |
| `@tessera-kit/notes/elements` | Defines every notes element, and the editor elements that notes are written with. |
| `@tessera-kit/notes/elements/<tag>` | Defines one element and the ones it renders, for importing exactly what a page uses: `tessera-note`, `tessera-notes`. |
| `@tessera-kit/notes/autoload` | Only registers the tags (98 B gzip). Each element downloads the first time it appears on the page, which suits plain HTML pages. |
| `@tessera-kit/notes` | The headless API and the plugin, without elements. |
| `@tessera-kit/notes/react` | React components. |

```html
<script type="module">
  import '@tessera-kit/notes/autoload';
</script>
```

## Configuration

<!-- config:start -->

| Option | Type | Default | Description |
|---|---|---|---|
| `layout` | `"grid" \| "free"` | `"grid"` | `grid` is a responsive masonry (pinned first, newest first); `free` is a canvas where notes can be dragged and resized. |
| `allowLayoutSwitch` | `boolean` | `true` | Show the grid/free switch. |
| `colors` | `Array<"yellow" \| "pink" \| "blue" \| … (7 values)>` | `["yellow","pink","blue","green","purple","orange","gray"]` | Colours a note can have. |
| `defaultColor` | `"yellow" \| "pink" \| "blue" \| … (7 values)` | `"yellow"` | Colour of new notes (the first allowed colour when this one is not allowed). |
| `tags` | `boolean` | `true` | Notes can be tagged and filtered by tag. |
| `search` | `boolean` | `true` | Show the search box. |
| `pinning` | `boolean` | `true` | Notes can be pinned to the top. |
| `archive` | `boolean` | `true` | Notes can be archived instead of deleted. |
| `editor` | `object` | `{"toolbar":["bold","italic","bullet-list","task-list","li…` |  |
| `editor.toolbar` | `Array<"undo" \| "redo" \| "heading" \| … (23 values) \| "\|">` | `["bold","italic","bullet-list","task-list","link"]` | Toolbar of the inline editor. |
| `sync` | `"none" \| "live"` | `"live"` | `live` applies changes made in other tabs or by other users as they happen. |

<!-- config:end -->

## Element reference

### `<tessera-notes>`

| Attribute / property | Description |
|---|---|
| `board` | Board id, `default` when left out |
| `readonly` | Hides every control that changes data |

| Event | Detail |
|---|---|
| `note-create` | `{ note }` |
| `note-update` | `{ note, patch }` |
| `note-delete` | `{ note }` after a note was deleted from the UI (it can be undone) |

Bus events (`instance.on(...)`): `notes:created`, `notes:updated`, `notes:deleted`, `notes:conflict`.

| CSS part | Element |
|---|---|
| `toolbar`, `note`, `header`, `body`, `footer` | The toolbar and the parts of each note |

| Slot | Content |
|---|---|
| `toolbar-end` | Extra controls at the end of the toolbar |
| `empty` | Shown when there are no notes |

### Keyboard

Focus a note and press `Enter` to edit it or `Delete` to remove it (undo brings it back). On the free canvas the arrow keys move the focused note by 8 px (32 px with `Shift`), and the arrow keys on its resize handle change its size. `Ctrl/⌘ + Z` and `Ctrl/⌘ + Shift + Z` undo and redo.

## Controller API

`NotesController`: `state` (store with `notes`, `tags`, `query`, `layout`, …), `history`, `getNote`, `create`, `update`, `move`, `resize`, `bringToFront`, `setColor`, `togglePin`, `archive`, `unarchive`, `delete`, `setQuery`, `setTag`, `setShowArchived`, `setLayout`, `exportJSON`, `importJSON(data)`, `close`.
