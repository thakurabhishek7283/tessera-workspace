# Architecture

This page is for people changing the code. The user-facing view is in the [package READMEs](../packages) and the [playground](https://thakurabhishek7283.github.io/tessera-workspace/). The core packages this repository builds on are described in the [`tessera` architecture notes](https://github.com/thakurabhishek7283/tessera/blob/main/docs/architecture.md).

## Packages

```text
                 @tessera-kit/core   @tessera-kit/elements   @tessera-kit/storage   (peers, from the tessera repo)
                      ▲                 ▲                    ▲
        ┌─────────────┴────────┬────────┴─────────┬──────────┘
        │                      │                  │
 @tessera-kit/editor ◀──── @tessera-kit/notes       @tessera-kit/kanban
        ▲                                         │
        └─────────────────────────────────────────┘

 private, bundled into the kits:
   @tessera-internal/dnd        sortable drag and drop inside shadow roots (kanban)
   @tessera-internal/persist    optimistic, version-checked writes and live sync (kanban, notes)
   @tessera-internal/react-wrap SSR-safe React wrappers for custom elements (all three)
   @tessera-internal/test-utils fixtures, axe helper, instance mounting (tests only)
```

Kits never import each other except through `@tessera-kit/editor`, which notes and kanban use for their text fields. Everything else a kit needs from the outside comes through the instance: storage, uploads, the bus, i18n and the user.

## One kit, four layers

Each kit has the same shape, which is the one the `tessera` core expects of a plugin.

1. **Schemas** (`schemas.ts`, `config.ts`): zod definitions of the stored documents and of the feature options. The config schema is the single source for the README tables (`scripts/gen-config-docs.mjs`) and for the playground's config form.
2. **Controller** (`controller.ts`): holds the state in a store, applies every change as a *command* with `do`, `undo` and an optional `merge`, saves through `persist`, and emits bus events. It knows nothing about the DOM, so the node tests cover almost all behaviour.
3. **Plugin and API** (`plugin.ts`, `api.ts`): `definePlugin` registers the feature, validates the options and exposes the API (`open(boardId)` returns a controller). Messages for `en` and `de` are merged into the instance's i18n.
4. **Elements** (`elements/`): the public element extends `TesseraElement`, finds the instance and controller, and renders with Lit. Inner elements (`tessera-kanban-column`, `-card`, `-card-dialog`, `-filters`, `tessera-note`) are plain Lit elements that receive a `view` object (the translate function, the capability flags, the readonly flag), so they have no instance lookup of their own.

`react/` wraps the elements with `wrapElement` and adds hooks that read the controller's store with `useSyncExternalStore`.

## Data flow of a card move

```text
pointer / keyboard ─▶ dnd sortable ─▶ onMove(card, toColumn, toIndex)
        │
        ▼
 board element fires cancelable `card-move`  ── preventDefault ─▶ nothing happens
        │
        ▼
 controller.moveCard ── beforeCardMove / WIP limit ─▶ refused: `kanban:move-blocked`, toast
        │ allowed
        ▼
 rank = rankBetween(prev, next)  ·  command pushed to history
        │
        ▼
 persist.commit  ── optimistic map update ─▶ onChange ─▶ store ─▶ re-render
        │
        ▼
 storage.put(version)  ── CONFLICT ─▶ refetch, run the move again, `kanban:conflict`
        │
        ▼
 other tabs: storage.watch ─▶ persist.follow ─▶ their store ─▶ re-render
```

See [ADR 5](decisions/0005-fractional-ranks.md) for ranks and [ADR 6](decisions/0006-optimistic-writes.md) for the write path.

## Drag and drop

`@tessera-internal/dnd` is built for shadow DOM, where `document.elementsFromPoint` and global `querySelector` stop at the shadow boundary. A sortable is given a `root` (the board's shadow root, where pointer events are caught, shadow roots inside it included) and a function returning the current containers, each with an id, an element and a function returning its items. The library never renders: it only sets attributes and CSS custom properties, so the consuming element keeps control of the markup.

| Attribute | Set on | Meaning |
|---|---|---|
| `data-dragging` | the dragged item | styles the original while a ghost follows the pointer |
| `data-drop-target` | the container under the pointer | highlight |
| `data-drop-before` / `data-drop-end` | the item the dragged one goes before, or the last item | where the insertion marker goes |
| `data-dnd-ghost` | the ghost element | styles the copy that follows the pointer |

Keyboard dragging follows the pattern Space (lift), arrows (move), Space (drop), Escape (cancel) and announces each step through an `aria-live` region built from translatable messages. Touch uses the same pointer path with a short hold (200 ms) to tell a drag from a scroll, and edge scrolling works for the nearest scrollable ancestors on both axes. Containers can refuse an item through `accepts` (a full column), and `canDrag` switches dragging off for read-only boards.

## Editor

`@tessera-kit/editor` is split so that nothing heavy loads until it is needed:

- `service.ts` is the plugin's API. `renderStatic` and `toPlainText` are synchronous and need no Tiptap.
- `create()` dynamically imports `engine/`, which builds the Tiptap editor from the feature config. Code highlighting and tables are separate dynamic imports that only run when switched on.
- The element mounts the editor into its shadow root, so ProseMirror's styles are injected there (`proseStyles`), and uses `ElementInternals` for form association.

[ADR 3](decisions/0003-static-renderer-and-sanitizing.md) explains the renderer and the sanitizing rules.

## Testing

| Level | Tool | Covers |
|---|---|---|
| Unit | Vitest (node) | schemas, ranks, filters, controllers with a fake storage, persistence conflicts, i18n catalogs |
| Component | Vitest browser mode (Chromium) | elements, DnD with real pointer and keyboard input, sanitizing with real DOMPurify, axe in light and dark |
| End to end | Playwright against the built playground | create a board, drag, reload, two tabs, the editor's slash menu, pasted HTML, notes |
| Budgets | size-limit | gzipped size of each kit ([ADR 7](decisions/0007-bundle-budgets.md)) |

## Build and dependencies

`pnpm deps` puts the `tessera` repository at `external/tessera` and builds it; the root `pnpm.overrides` link the `@tessera-kit/*` peers to it ([ADR 1](decisions/0001-cross-repo-dependencies.md)). Each package builds with `tsdown`, which bundles the private `@tessera-internal/*` packages and leaves real dependencies external ([ADR 2](decisions/0002-internal-packages-are-bundled.md)). Turborepo orders the builds and caches them.
