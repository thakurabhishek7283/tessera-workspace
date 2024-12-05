# 4. Keep `isolatedDeclarations` in the base config, but switch it off per package

Status: accepted

## Context

The base `tsconfig` turns on `isolatedDeclarations`, which makes declaration builds fast and forces explicit types on exports. Every package here exports zod schemas (`z.object(…)` and the types inferred from them) and Lit elements whose reactive properties are declared in a `static properties` map. Annotating the inferred schema types by hand would duplicate each schema and let the copy drift from it.

## Decision

The flag stays in `tsconfig.base.json` as the intended default, and each package sets `"isolatedDeclarations": false`. Exported functions and class members still carry explicit types by convention. `tsdown` generates declarations with the TypeScript compiler.

## Consequences

- Declaration builds are a little slower than they could be.
- A package with no schemas or elements can drop the override without other changes.
- Public types are still reviewed in the generated `.d.ts` files.
