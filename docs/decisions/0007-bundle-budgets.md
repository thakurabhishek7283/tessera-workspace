# 7. Bundle budgets measured with size-limit, and where we differ from the plan

Status: accepted

## Context

The engineering standards set budgets in kB of minified and gzipped code, excluding peer dependencies: kanban 22, notes 15, editor (with Tiptap, lazy) 120.

## Decision

`pnpm size` (size-limit, run in CI) measures each package's built output with its own third-party dependencies and without the peers (`@tessera/*`, `lit`, `zod`, `react`). Results at the time of writing:

| Entry | Budget | Measured |
| --- | --- | --- |
| editor, elements and entry (own code) | 20 kB | 16.8 kB |
| editor, Tiptap engine (lazy, with ProseMirror, Markdown, DOMPurify, linkify) | 170 kB | 167 kB |
| kanban, entry and plugin | 22 kB | 8.9 kB |
| kanban, elements | 27 kB | 25.6 kB |
| notes, entry and plugin | 15 kB | 4.8 kB |
| notes, elements | 15 kB | 12.0 kB |

Two budgets are higher than planned. The editor engine is 167 kB because ProseMirror, `@tiptap/markdown` (with `marked`), DOMPurify and the link detector are each needed for features the editor advertises; it loads on first use only. Kanban's elements are 25.6 kB because the board, column, card, filter bar and card dialog ship together with their styles. Code highlighting (`lowlight`) and tables are separate lazy chunks, switched on by config, and are not counted.

## Consequences

- CI fails when a kit grows past its budget, so growth is a decision, not an accident.
- Getting the engine under 120 kB would mean dropping Markdown import or the HTML sanitizer; neither is worth it for a one-off load.
