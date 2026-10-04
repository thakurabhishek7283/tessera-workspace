# 2. Share code between kits through private packages that are bundled in

Status: accepted

## Context

Kanban and notes both need optimistic, version-checked writes, and kanban needs drag and drop that works inside shadow roots. The first design had one internal package, `@tessera-internal/dnd`. Both pieces of code are useful beyond one kit and deserve their own tests, but neither is an API we want to support for other people yet. The test helpers and the React wrapper factory are in the same position.

## Decision

`@tessera-internal/dnd`, `persist`, `react-wrap` and `test-utils` are `private` workspace packages. Each public kit lists the ones it needs as `devDependencies` and its `tsdown` config sets `noExternal: [/^@tessera-internal\//]`, so their code ends up inside the kit's own files. They are ignored by changesets and never published.

## Consequences

- Installing `@tessera-kit/kanban` pulls in no package that does not exist on npm.
- The shared code is tested once, in its own package, and used by two kits.
- Two kits that bundle the same internal package each carry a copy. Both are small (see the size budgets), and a page rarely uses more than one of them.
- Promoting an internal package to a public one later is a rename plus a changeset; nothing else has to move.
