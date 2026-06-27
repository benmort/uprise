# 01 – Monorepo Packages & Shared DB Client

Foundation step 1–2. Introduce a `packages/*` workspace tier and move the Prisma client into it. No domain logic. This unblocks every later doc.

## 1. Add `packages/*` to the workspace

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

Scaffold four empty packages (filled by later docs):

| Package | Purpose | Filled by |
|---|---|---|
| `@uprise/db` | `schema.prisma` + generated Prisma client | this doc |
| `@uprise/permissions` | CASL roles/abilities (ported from prog) | doc 04 |
| `@uprise/events` | typed domain-event catalogue + `Reaction` interface | doc 05 |
| `@uprise/contracts` | shared Zod DTOs + `{ok,data,error}` envelope types | as needed |

Each package: `package.json` (`"name": "@uprise/<x>"`, `"main"`/`"types"` or `exports`), `tsconfig.json` extending the root, `src/index.ts`. Reference from apps with `"@uprise/<x>": "workspace:*"`.

## 2. `@uprise/db` – the shared Prisma client

**Problem today:** the single schema lives at `apps/api/prisma/schema.prisma`, generates into `apps/api/src/generated/prisma`, and the worker copies it via `apps/worker/scripts/copy-prisma-generated.mjs` and imports through brittle relative paths (`../../api/src/generated/prisma`).

**Move:**

1. Create `packages/db/` with `prisma/schema.prisma` (moved from `apps/api/prisma/`) and generator `output = "../generated"`; export `PrismaClient` + all types from `packages/db/src/index.ts` as `@uprise/db`.
2. `apps/api`, `apps/worker`, and any future package import `import { PrismaClient, Prisma } from "@uprise/db"`.
3. `apps/api/src/prisma/prisma.service.ts` wraps `@uprise/db`'s `PrismaClient` (unchanged behaviour).
4. **Delete** `apps/worker/scripts/copy-prisma-generated.mjs` and re-point `apps/worker/src/main.ts` imports to `@uprise/db`.
5. Move the `prisma:generate`/`prisma:migrate`/`prisma:deploy` scripts to `packages/db` (run via `pnpm --filter @uprise/db ...`); update root scripts and the migration runbook (`docs/migration-runbook.md`) accordingly.

This makes the Prisma client the single most-shared artefact – which is exactly what the `packages/` tier is for – and removes the copy-script foot-gun.

## 3. Prisma v6 upgrade

multiSchema (doc 02) is GA in Prisma 6. Do the bump here, before any schema restructuring, so namespacing never rides a preview flag.

- Bump `prisma` and `@prisma/client` to v6 in `packages/db`.
- Regenerate the client; run the existing api jest suite + `pnpm --filter admin build`.
- Review the v6 changelog for client API deltas (validate against `apps/api/src/**` Prisma calls); fix any.

## Verification

```bash
pnpm install
pnpm --filter @uprise/db prisma:generate
pnpm --filter api typecheck && pnpm --filter api build
pnpm --filter api test
pnpm --filter worker build
pnpm --filter admin build
```

Gate: all green, no remaining import of `apps/api/src/generated/prisma`, copy-script deleted.

## Files

- `pnpm-workspace.yaml` – add `packages/*`.
- `packages/db/**` – new; holds `schema.prisma` + generated client.
- `apps/api/src/prisma/prisma.service.ts` – wrap `@uprise/db`.
- `apps/worker/src/main.ts` – import `@uprise/db`; remove copy-script step.
- `apps/worker/scripts/copy-prisma-generated.mjs` – delete.
- `apps/api/package.json`, `apps/worker/package.json`, root `package.json` – `@uprise/db` dep + script moves.
