# Page cost baseline, October 2026

Measured on 2026-10-04 with `pnpm budget` (rolldown 1.2.12, minified ESM, code splitting on, gzip level 9, brotli quality 11), every dependency included except `react` and `react-dom`. Each page is the `tessera` base page (`createTessera` plus `@tessera-kit/elements/define`) plus the kit's `elements` entry, the way the README's quick start uses it. Budgets in `budgets/pages.json` start at these numbers plus 3%. See [ADR 8](../decisions/0008-page-budgets-and-the-shared-peer-trigger.md).

| Page | Initial gzip | Initial brotli | Total gzip | Budget (initial / total gzip) |
| --- | ---: | ---: | ---: | ---: |
| `kanban-page` | 81.4 KB | 70.7 KB | 585.8 KB | 83.9 / 603.4 KB |
| `notes-page` | 71.3 KB | 62.2 KB | 571.0 KB | 73.5 / 588.2 KB |
| `editor-page` | 63.7 KB | 55.7 KB | 558.7 KB | 65.6 / 575.5 KB |
| `kanban+notes-page` | 87.2 KB | 74.9 KB | 596.3 KB | 89.9 / 614.3 KB |

"Initial" is the entry chunk plus its static imports. "Total" adds every lazy chunk: the plugins, the Tiptap engine, code highlighting, tables, storage and transport.

## Top contributors (initial load)

| Package | kanban | notes | editor | kanban+notes |
| --- | ---: | ---: | ---: | ---: |
| zod | 28.0 KB | 28.0 KB | 27.9 KB | 28.0 KB |
| @tessera-kit/elements | 16.2 KB | 17.2 KB | 17.2 KB | 16.1 KB |
| @tessera-kit/kanban | 15.3 KB | | | 15.1 KB |
| @tessera-kit/editor | 8.5 KB | 8.9 KB | 9.0 KB | 8.5 KB |
| @tessera-kit/notes | | 6.7 KB | | 6.2 KB |
| @tessera-kit/core | 4.2 KB | 4.2 KB | 3.8 KB | 4.2 KB |
| @tessera-internal/dnd | 3.4 KB | | | 3.3 KB |
| lit-html + @lit/reactive-element + lit-element | 5.0 KB | 5.3 KB | 4.8 KB | 5.0 KB |

Package figures are each package's share of its chunks' gzip size, in proportion to its rendered code.

## What this says

- **zod is the largest package on every page**, 28 KB gzip and a third or more of the initial load. Session 0.2 of the plan moves the runtime path to `zod/mini`.
- **Duplicate internal packages: `@tessera-internal/persist` ×2 (kanban, notes)** on `kanban+notes-page`. Both copies sit in the lazily loaded plugin chunks, so they cost download and parse time after the elements render rather than on first paint. Under ADR 8 this triggers promotion of `persist` to `@tessera-kit/shared`. `dnd` is only used by kanban, so it isn't duplicated.
- **Kanban and notes always load the editor's elements** (about 8.5 KB gzip initially), because both import `@tessera-kit/editor/elements` at module load for rich-text card and note bodies.
- **`highlight.js` is about 295 KB gzip of lazy chunks** on every page that can show an editor. The engine only uses `createLowlight(common)`, but `import('lowlight')` keeps the whole module, including the `all` grammar set. It's lazy, so it doesn't affect first paint, but anyone who opens a code block downloads all of it. The size-limit budget for the engine ignores `lowlight`, so this wasn't visible before.
