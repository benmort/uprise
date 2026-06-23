---
name: package-build
description: Which @yarns/* packages must be rebuilt after a src edit, and the one that must not.
layer: packages
topic: build
use_when: After editing any packages/* src, or when a consumer compiles against stale package output.
last_reviewed: 2026-06-23
---

# Package build

A `@yarns/*` package's consumers (api, worker, Next apps) import its built output, not its `src` – so a `src` edit is invisible until the package is rebuilt. The exceptions are `@yarns/db` (generated, not tsc-built) and `@yarns/ui` (consumed from source).

Canonical: `packages/*/package.json` build scripts and `main` fields, plus `apps/*/next.config.mjs` `transpilePackages`.

## Must have
- `@yarns/events`, `@yarns/permissions`, `@yarns/contracts`, `@yarns/api-client` each build to `dist` via `tsc -p tsconfig.json` (their `main` is `dist/index.js`). After editing any of their `src`, rebuild: `pnpm --filter @yarns/<name> build`. Consumers do not pick up the change otherwise.
- `@yarns/db` has no tsc build – its `main` is `generated/index.js`. It is "rebuilt" by regenerating the client: `pnpm --filter @yarns/db prisma:generate` (see `packages/dev/ai/how-to/db-and-prisma.md`).
- `@yarns/ui` is the exception that needs no build step – its `main` is `src/index.ts` and the Next apps consume it from source via `transpilePackages: ["@yarns/ui", "@yarns/api-client", "@yarns/contracts"]` in `apps/*/next.config.mjs`. Editing its `src` is picked up directly by the apps' dev server / build.
- When a change spans packages (e.g. an event added in `@yarns/events` that `@yarns/api-client` types against), rebuild in dependency order before building the consuming app.

## Anti-patterns
- Editing a tsc-built package's `src` and running the api/worker against the old `dist` – the change does not exist for them yet.
- Running `tsc` build on `@yarns/ui` or `@yarns/db` – `ui` is source-consumed and `db` is generated; neither has a `build` script.
- Assuming a Next app's HMR reflects a `@yarns/permissions`/`@yarns/contracts` change – those are `dist` packages, not transpiled from source; rebuild them first.

## Checklist
- [ ] Edited a tsc-built package (`events`/`permissions`/`contracts`/`api-client`)? Ran `pnpm --filter @yarns/<name> build`.
- [ ] Edited the Prisma schema? Ran `prisma:generate` for `@yarns/db` instead of a build.
- [ ] Edited `@yarns/ui`? No build needed – confirmed the consuming app is in `transpilePackages`.
- [ ] Cross-package change rebuilt in dependency order before building the app.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `packages/dev/ai/how-to/events-catalogue.md`, `packages/dev/ai/how-to/permissions-package.md`, `packages/dev/ai/how-to/db-and-prisma.md` – the per-package rebuild detail.
- `dev/ai/how-to/definition-of-done.md` – the rebuild-after-src-edit gate.
