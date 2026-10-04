# Page cost after define-on-first-use (session 0.3)

Measured on 2026-10-04 with `pnpm budget` against tessera's `perf/lazy-define` branch (production builds). Previous: [after-0.2.md](after-0.2.md).

None of these kits loaded chunks eagerly, so this session adds entries (per-element and `autoload`) rather than removing downloads. The page-budget script (copied from tessera) now also counts chunks that a loaded chunk `import()`s as soon as it runs; nothing here does that, so the method change doesn't move these numbers. "Before" is `main`'s kit code measured with the same script and the same tessera.

| Page | Initial gzip before | Initial gzip after | Total gzip after | Budget, initial gzip |
| --- | ---: | ---: | ---: | ---: |
| `editor-page` | 46.1 KB | 46.1 KB | 541.1 KB | 46.8 KB (unchanged) |
| `kanban-page` | 64.0 KB | 64.5 KB | 569.0 KB | 65.2 KB (unchanged) |
| `notes-page` | 53.9 KB | 54.1 KB | 554.0 KB | 54.8 KB (unchanged) |
| `kanban+notes-page` | 69.8 KB | 69.8 KB | 579.1 KB | 71.2 KB (unchanged) |

Session 0.2 recorded editor 45.4, kanban 63.3 and notes 53.2 KB. Most of the difference (0.7–0.8 KB) is tessera's base page, which grew in session 0.3 (`lazyDefine` is part of every `TesseraElement`). The rest (up to 0.5 KB on `kanban-page`) is this change: a `static tesseraVersion` on every element class, and one more chunk in the page now that each tag is its own module.

No budget moved. Measured plus 3% is above every current budget, and none had to go up.

## Own-code size limits (size-limit, gzip)

| Entry | Before | After | Limit |
| --- | ---: | ---: | ---: |
| editor elements and entry | 16.8 kB | 16.79 kB | 20 kB |
| kanban elements | 25.71 kB | 25.96 kB | 27 kB |
| notes elements | 12.13 kB | 12.15 kB | 15 kB |
| editor autoload | | 109 B | 0.3 kB (new) |
| kanban autoload | | 137 B | 0.3 kB (new) |
| notes autoload | | 98 B | 0.3 kB (new) |
