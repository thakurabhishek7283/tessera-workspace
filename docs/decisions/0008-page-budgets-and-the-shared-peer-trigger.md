# 8. Page budgets, and when shared internals become a peer (amends 2)

Status: accepted

## Context

The size-limit budgets (ADR 7) measure each package's own code and ignore its peers: `@tessera-kit/*`, `lit`, `zod`. They can't show what a page downloads. ADR 2 bundles `@tessera-internal/*` into each kit and accepts duplicate copies because "a page rarely uses more than one of them". Tessera Studio will compose several kits per page, which weakens that assumption. The same decision was taken in `tessera` (its ADR 6).

## Decision

- `pnpm budget` (`scripts/page-budget.mjs`, copied from `tessera`) bundles realistic pages from `budgets/pages/*.ts` with rolldown, every dependency included except `react` and `react-dom`, and fails CI when a page goes over `budgets/pages.json`.
- The report counts copies of every package on a page. Copies of an internal package are found through the `//#region` markers tsdown leaves in each kit's `dist`.
- **Amendment to ADR 2:** when a realistic composed page carries two or more copies of the same internal package, that package is promoted to a published peer, `@tessera-kit/shared`, with its own changeset and size limit. Until then ADR 2 stays the default.
- Budgets start at the October 2026 baseline plus 3% (`docs/perf/baseline-2026-10.md`) and only go down.

## Consequences

- `kanban+notes-page` already carries `@tessera-internal/persist` twice, which triggers the promotion. It's tracked as its own piece of work; this ADR only sets the rule.
- Bloat arriving through peers, shared dependencies or duplicate copies shows up in every pull request.
