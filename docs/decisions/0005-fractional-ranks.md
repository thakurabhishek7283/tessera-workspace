# 5. Order cards and columns with fractional-index ranks

Status: accepted

## Context

Boards are edited by several tabs and users at once. Storing the order as an array on the board would make every move a conflict with every other move. Storing an integer position on each card would make every move rewrite many cards.

## Decision

Each card and column has a string `rank` (from `fractional-indexing`); the order is the rank order. A move computes one new rank between the neighbours and writes one document. If the neighbours are equal or out of order (two clients picked the same rank) or a rank grows past `MAX_RANK_LENGTH`, the controller rewrites that list with evenly spaced ranks (a *rebalance*) and tries again.

## Consequences

- A move touches one document, so two people moving different cards never conflict.
- A rebalance changes no visible order, so it is not an undo step. Undoing a move puts the card back at its old index in the list it came from.
- Ranks are opaque strings. Anything that sorts by `rank` has to compare them as plain strings, not locale-aware.
