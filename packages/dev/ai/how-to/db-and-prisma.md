---
name: db-and-prisma
description: How @yarns/db wraps the generated Prisma client and how to change the schema.
layer: packages
topic: database
use_when: Editing the Prisma schema, adding a model/enum, or regenerating the client.
last_reviewed: 2026-06-23
---

# DB and Prisma

`@yarns/db` is the generated Prisma client re-exported as a package; the api, worker and seeds import it rather than reaching into Prisma directly.

Canonical: `packages/db/prisma/schema.prisma` (`datasource db` with `schemas = [...]` multiSchema, every model/enum tagged `@@schema("<domain>")`; `generator client` outputs to `../generated`) and `packages/db/package.json` (`main`/`types` point at `generated/`; scripts `prisma:generate`, `prisma:deploy`).

## Must have
- The schema is multiSchema: each model and enum declares `@@schema("<domain>")` where the domain is one of the `schemas` array (`iam`, `tenant`, `audience`, `messaging`, `canvass`, `journey`, `integration`, `analytics`, `events`, `email`, `ops`, `payment`, `telephony`, `public`). A new model with no `@@schema` will not generate.
- Keep an entity's domain consistent – its `@@schema` must match the namespace its events and permissions use (e.g. an audience model is `@@schema("audience")`).
- After any schema edit, regenerate the client: `pnpm --filter @yarns/db prisma:generate` (the `postinstall` also runs it). Then rebuild any package/app that needs the new types.
- Apply schema changes with hand-written, additive migrations via `prisma migrate deploy` (the `prisma:deploy` script). Never `migrate dev` – it drops the raw partial-unique indexes.
- `@yarns/db` re-exports the generated client; consumers import from `@yarns/db`, never from `packages/db/generated/*` directly.

## Anti-patterns
- Editing files under `packages/db/generated/` – they are generated output and are overwritten on the next `prisma:generate`.
- A new model/enum without `@@schema` – it silently fails to belong to a namespace.
- `prisma migrate dev` against this schema – drops partial-unique indexes (see definition-of-done).
- Editing the schema and forgetting to regenerate – consumers compile against the stale client.

## Checklist
- [ ] New models/enums carry `@@schema("<domain>")` matching the `schemas` array.
- [ ] `pnpm --filter @yarns/db prisma:generate` run.
- [ ] Migration is additive, hand-written, applied with `prisma:deploy` (not `migrate dev`).
- [ ] Consumers import from `@yarns/db`, not `generated/`.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `packages/dev/ai/how-to/package-build.md` – rebuilding consumers after a client change.
- `dev/ai/how-to/definition-of-done.md` – the migrations rule.
