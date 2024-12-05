# 6. Write optimistically and re-apply on version conflicts

Status: accepted

## Context

Dragging a card must feel instant even with a REST storage adapter, and two people editing different fields of one card should not lose each other's changes. Storage documents carry a `version`; a write with a stale version is rejected.

## Decision

`@tessera-internal/persist` keeps an in-memory map per collection. `commit(kind, id, mutate)` applies `mutate` to the map immediately, then writes with the version it knows. On a version conflict it fetches the stored copy and runs `mutate` again on it, up to a few attempts; a success after at least one conflict is reported as `reapplied`. If the document was deleted meanwhile the local copy is removed and the conflict is `dropped`; if the document keeps changing, the stored copy wins and the conflict is `reverted`. Any other write error puts the previous value back and is rethrown. Conflicts are reported through `onConflict` and shown as a toast.

Changes made by other writers arrive through `storage.watch`. While a write of ours is in flight for a document, its echoes are ignored, so a slow response cannot overwrite a newer local edit.

## Consequences

- Edits to different fields of the same document merge; edits to the same field are last-writer-wins, which matches the "no CRDT in v1" non-goal.
- Undo of an edit restores only the fields that edit touched, so it does not erase a remote change to other fields.
- The behaviour is covered by unit tests against a fake storage and by a two-tab end-to-end test.
