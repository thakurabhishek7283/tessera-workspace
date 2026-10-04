# Page cost after moving to zod/mini (session 0.2)

Measured on 2026-10-04 with `pnpm budget`, which now builds pages the way a production app does (`process.env.NODE_ENV` replaced with `"production"`), against `tessera` with core, protocol and storage on zod/mini. Baseline: [baseline-2026-10.md](baseline-2026-10.md). Decision: [ADR 9](../decisions/0009-zod-mini.md).

| Page | Initial gzip before | Initial gzip after | New budget (initial / total) |
| --- | ---: | ---: | ---: |
| `kanban-page` | 81.4 KB | **63.3 KB** | 65.2 / 584.8 KB |
| `notes-page` | 71.3 KB | **53.2 KB** | 54.8 / 569.6 KB |
| `editor-page` | 63.7 KB | **45.4 KB** | 46.8 / 556.7 KB |
| `kanban+notes-page` | 87.2 KB | **69.1 KB** | 71.2 / 595.7 KB |

zod was about 28 KB gzip on every page. It's now about 3 KB from core plus what the kit's own schemas use; those schemas load with the elements, so the zod/mini code they need (objects, defaults, enums, string and number checks) is part of the first load. Moving the option schemas behind the lazily loaded plugin is a possible next step.
