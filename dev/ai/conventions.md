---
name: conventions
description: Cross-layer commands, imports, language, and build rules every uprise task obeys.
layer: root
topic: conventions
use_when: Any task – the shared command/style rules that sit under every guide.
last_reviewed: 2026-06-23
---

# Conventions

Cross-layer rules. Layer-specific patterns live in the per-layer how-to guides routed from `dev/ai/guide-map.md`.

## Commands

- **Typecheck:** `pnpm -r typecheck` (whole workspace) or `pnpm --filter <pkg> typecheck` for one project.
- **Test:** `pnpm --filter api test` (the api suite – includes `app.module.boot.spec.ts`, the DI boot gate); `pnpm --filter <pkg> test` elsewhere. `pnpm --filter api test -- <pattern>` to scope.
- **Build:** `pnpm -r build` (all) or `pnpm --filter <app> build`.
- **Dev:** `pnpm dev:all` (every app + worker in parallel) or `pnpm dev:api` / `dev:admin` / `dev:auth` / `dev:product-marketing` / `dev:organisation-marketing` / `dev:worker`.
- **Prisma:** `pnpm --filter @uprise/db prisma:generate` after a schema change; `pnpm --filter @uprise/db prisma:deploy` to apply migrations. **Never `prisma migrate dev`** – see `apps/api/dev/ai/how-to/migrations.md`.

## Imports & packages

- Cross-package: import from the `@uprise/*` workspace package, never deep-path into another package's `src`/`dist`.
- Within an app: relative imports. There are **no** intra-app path aliases – do not add `@api/`-style ones.
- After editing a `@uprise/*` package's `src`, rebuild its dist (`pnpm --filter @uprise/<pkg> build`) so consumers see the change. Exception: `@uprise/ui` is consumed from source by the Next apps (`transpilePackages`), so no build step.

## Language & style

- Australian English in code, comments, docs, and UI (`organise`, `colour`, `authorise`).
- Spaced en-dashes for parenthetical breaks; never the em-dash character.
- Match the surrounding code's idiom, comment density, and naming.

## Cross-schema rule

Prisma uses multiSchema. References across schemas are **id-only** (a `String` holding the other row's id) – no cross-schema foreign keys. See `apps/api/dev/ai/how-to/domain-boundaries.md`.

## Related guides

- `dev/ai/how-to/definition-of-done.md` – the gate these commands feed.
- `apps/api/dev/ai/how-to/migrations.md` – the migrate-deploy discipline.
- `packages/dev/ai/how-to/package-build.md` – the dist rebuild rule.
