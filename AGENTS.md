# Repository Guidelines

## Project Structure & Module Organisation

This is a pnpm 11 workspace (`apps/*`, `packages/*`) targeting Node 24. `apps/api` is the NestJS API; `apps/worker` runs BullMQ consumers. The Next.js applications live in `apps/admin`, `apps/auth`, `apps/action`, `apps/field`, and the two marketing directories. Shared code is published internally from `packages/*` as `@uprise/*`; Prisma schema and migrations belong in `packages/db`. Tests are normally colocated with source. Browser journeys are in `apps/admin/e2e`, static assets in each app's `public`, operational notes in `docs`, and automation in `scripts`.

Before changing a subsystem, consult `dev/ai/guide-map.md`; `docs/meld` is the architecture reference.

## Build, Test, and Development Commands

- `pnpm install --frozen-lockfile` installs the pinned workspace dependencies.
- `pnpm dev:all` starts all apps, the worker, and the tunnel; use `pnpm dev:api` or `pnpm dev:admin` for a focused process.
- `pnpm lint && pnpm typecheck` runs repository-wide static checks.
- `pnpm test` runs package tests; target one project with `pnpm --filter api test`.
- `pnpm build` builds the workspace. If a Next dev server may be running, use `NEXT_DIST_DIR=.next-validate pnpm --filter <app> build`.
- `pnpm --filter admin e2e` runs Playwright journeys.

## Coding Style & Naming Conventions

Write TypeScript with two-space indentation, double quotes, semicolons, and the surrounding file's established patterns. Use Australian English (`organise`, `colour`) and spaced en dashes. Components and classes use PascalCase; functions and variables use camelCase; service files use descriptive kebab-case suffixes such as `message-template.service.ts`. Import across packages through `@uprise/*`; use relative imports within an app and do not introduce app-local aliases.

## Testing Guidelines

The API uses Jest with `*.spec.ts`; other packages use Vitest, commonly with `*.test.ts`; end-to-end tests use Playwright. Add tests with behavioural changes. CI requires changed lines in instrumented source to reach at least 80% coverage without lowering `coverage-baseline.json`; verify with `pnpm coverage:check`. API changes must retain the DI boot smoke test.

## Commits & Pull Requests

Follow the history's Conventional Commit style, for example `feat(admin): add audience filters` or `fix(api): scope tenant lookup`. Keep commits focused. Pull requests should explain scope, risk, and validation; link the relevant issue, call out migrations or configuration changes, and include screenshots for visible UI changes. Ensure CI lint, typecheck, coverage, tests, builds, and relevant e2e checks pass.

## Security & Database Changes

Copy settings from each app's `.env.example`; never commit credentials or log secrets or PII. Keep migrations additive and apply them with `pnpm --filter @uprise/db prisma:deploy` – never `prisma migrate dev`.
