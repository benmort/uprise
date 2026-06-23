---
name: api-engineer
description: Backend layer-engineer entry point for the yarns NestJS/Prisma API – the always-true invariants plus an index routing any backend task to its how-to guide. Use when adding or changing a backend domain, model, endpoint, service, DTO, migration, event, reaction, state machine, BullMQ job, webhook, or Nest module – or when the api boot smoke / DI graph breaks.
---

# API engineer

The entry point for backend work on the yarns API (`apps/api`) – a NestJS modular monolith on Prisma with a transactional outbox, FSM-guarded state, CASL permissions, and BullMQ jobs. Read this, then read every guide whose row in the index fits the task before writing code. The unit of work is the task brief / the plan file / TODO notes – yarns has no board, no stories, no epics.

## Invariants (always true)

These hold on every backend change, regardless of the task. They are the same lines `apps/api/CLAUDE.md` and `dev/ai/how-to/definition-of-done.md` enforce.

- **id-only cross-domain; no cross-schema FKs.** Each domain owns one Postgres `@@schema("<domain>")` namespace and one `apps/api/src/<domain>/` module. A reference to a row in another schema is a bare id `String` – no `@relation`, no foreign key. To use another domain's behaviour, depend one-way on a **seam token** it provides (e.g. `JOURNEY_TRIGGER_PORT`, `TRANSACTIONAL_DISPATCHER`) or **react to its domain event** – never `import` its service or model. See `apps/api/dev/ai/how-to/domain-boundaries.md`.
- **Thin controllers; class-validator DTOs; always add `@RequirePermission`.** A controller binds the route, validates the body via a class-validator DTO, and delegates – no business logic. Authentication is default-deny (the global `BasicAuthGuard`), but permission-gating is opt-in: `AbilityGuard.canActivate` returns `true` for any route without `@RequirePermission` (`if (!required) return true`), and nothing scans for missing decorators at boot. So a missing decorator silently leaves the route reachable by any authenticated user – decorate every new endpoint with `@RequirePermission({ action, resource })` (resource from `YARNS_RESOURCES`), or make it a deliberate, justified public-allowlist entry. This is a discipline, not an automatic guarantee. See `apps/api/dev/ai/how-to/services-controllers-dtos.md` and `apps/api/dev/ai/how-to/permissions.md`.
- **Atomic emit: the state write and its event commit in the SAME transaction.** A state write that has a domain event runs inside `this.prisma.$transaction(async (tx) => …)` and appends the event via `this.outbox.append(tx, …)` in that **same** `tx`. Appending after the transaction closes (or in a second one) silently loses the event on a crash between write and append. Use `tx` for every read/write inside, never `this.prisma`; no external HTTP/SDK call inside the transaction. See `apps/api/dev/ai/how-to/transactions.md` and `apps/api/dev/ai/how-to/outbox-and-reactions.md`.
- **FSM guards on every lifecycle.** A status change goes through the domain's `*-state.machine.ts` guard – `assertValid<X>Transition` (throwing, 409) on command paths, `canTransition<X>` (non-throwing no-op) on replayable webhook/callback paths – run on a row loaded `SELECT … FOR UPDATE` when two paths can race it. Never branch on `status` ad hoc or mutate it with a raw `update`. See `apps/api/dev/ai/how-to/state-machines.md`.
- **Idempotent jobs + claim-guarded webhooks.** BullMQ producers enqueue with a deterministic id from a `getXJobId` helper so retries collapse to one job; consumers validate `job.data` with the matching `isXJobPayload` guard. A provider webhook verifies the signature over `req.rawBody`, then `claim(provider, eventId)` BEFORE acting and `release` on throw so the retry reprocesses. Delivery is at-least-once; reactions must tolerate replay. See `apps/api/dev/ai/how-to/bullmq-jobs.md` and `apps/api/dev/ai/how-to/webhooks.md`.
- **Additive migrations via `migrate deploy`.** Schema changes are hand-written, additive SQL (`ADD COLUMN` nullable/default, `ADD VALUE IF NOT EXISTS`, `CREATE INDEX`) in a new timestamped dir, mirrored in `schema.prisma`, applied with `prisma migrate deploy` – never `migrate dev` (it drops the hand-maintained partial-unique indexes). Regenerate the client and rebuild `@yarns/db` after. See `apps/api/dev/ai/how-to/migrations.md` and `packages/dev/ai/how-to/db-and-prisma.md`.
- **The boot smoke is the gate.** `apps/api/src/app.module.boot.spec.ts` `.compile()`s the whole DI graph – the ONLY check that catches provider-resolution bugs. Typecheck, `nest build`, and unit tests (which `new` services with mocks) all pass while a missing `@Global()` or unprovided token crashes startup. `pnpm --filter api test` (incl. the boot smoke) is part of "done". See `apps/api/dev/ai/how-to/module-wiring.md`.

## Guide index

Route the task to the guide(s) and read them before writing code. Most non-trivial changes touch several rows – follow them all.

| Backend task | Read |
|---|---|
| Add a model / wire a new module / reach for another domain's data | `apps/api/dev/ai/how-to/domain-boundaries.md` |
| Make a write produce a cross-domain effect; add/register a Reaction (atomic emit) | `apps/api/dev/ai/how-to/outbox-and-reactions.md` |
| Add or change a status lifecycle (enum + TransitionMap + guards) | `apps/api/dev/ai/how-to/state-machines.md` |
| Write a transactional mutation (atomic state+event, `FOR UPDATE` row lock) | `apps/api/dev/ai/how-to/transactions.md` |
| Authorise an endpoint (`@RequirePermission`, CASL, opt-in gating, allowlists) | `apps/api/dev/ai/how-to/permissions.md` |
| Ingest a provider webhook (Stripe/SendGrid/Twilio) idempotently | `apps/api/dev/ai/how-to/webhooks.md` |
| Add a BullMQ job, queue consumer, or CRON_SECRET dispatch endpoint | `apps/api/dev/ai/how-to/bullmq-jobs.md` |
| Add or alter a Prisma migration | `apps/api/dev/ai/how-to/migrations.md` |
| Wire a Nest module / pass the DI boot gate / chase a resolution crash | `apps/api/dev/ai/how-to/module-wiring.md` |
| Write or change a backend unit test (mocked-prisma) | `apps/api/dev/ai/how-to/testing-unit.md` |
| Build a controller / service / DTO slice | `apps/api/dev/ai/how-to/services-controllers-dtos.md` |
| Add or type a domain event in `@yarns/events` | `packages/dev/ai/how-to/events-catalogue.md` |
| Edit the Prisma schema / regenerate the client (`@yarns/db`) | `packages/dev/ai/how-to/db-and-prisma.md` |
| Add a resource/action/role in `@yarns/permissions` | `packages/dev/ai/how-to/permissions-package.md` |
| Rebuild a `@yarns/*` package after a `src` edit | `packages/dev/ai/how-to/package-build.md` |
| Shape a brand-new domain before cutting code | `dev/ai/how-to/domain-modelling.md` |
| Check whether the work is actually done | `dev/ai/how-to/definition-of-done.md` |

## Workflow

1. **Classify.** Name the work-unit from the task brief / plan file in one line; list which invariants it touches.
2. **Route.** Read every guide whose index row fits. A new stateful aggregate that signals another domain typically hits domain-boundaries → state-machines → events-catalogue → transactions → outbox-and-reactions → testing-unit → module-wiring.
3. **Model first** for a new domain or aggregate: schema namespace, id-only boundaries, enum + state machine, events, reactions (`dev/ai/how-to/domain-modelling.md`).
4. **Build the slice** per the guides: migration (additive), DTO (class-validator), service (transaction + outbox + FSM guard), thin controller (`@RequirePermission`), reaction if cross-domain, BullMQ job if async.
5. **Test** the new behaviour, including the FSM-guard and idempotency cases, not just the happy path (`apps/api/dev/ai/how-to/testing-unit.md`).
6. **Gate.** Walk `dev/ai/how-to/definition-of-done.md` and state evidence: `pnpm -r typecheck`, `pnpm --filter api test` (incl. the boot smoke), build of any changed app/package, and the rebuild of any edited `@yarns/*` package.

## Anti-patterns

- Cross-schema `@relation`/FK, or `import`ing another domain's service/model instead of a port token or an event.
- A new endpoint with no `@RequirePermission` (the `AbilityGuard` does NOT gate undecorated routes, so it silently stays reachable by any authenticated user – the footgun), or a resource string not in `YARNS_RESOURCES`.
- `outbox.append` outside the `$transaction` that wrote the row; using `this.prisma` instead of `tx` inside the callback; awaiting a provider SDK call inside the transaction.
- Mutating `status` with a raw `update` and no guard; throwing `assertValid…` on a webhook/callback path where a replay is legitimate.
- A random/uuid `jobId`; trusting `job.data` without its type guard; an in-API `setInterval` for scheduled work instead of a CRON_SECRET dispatch endpoint.
- Claiming a webhook and not releasing on error; verifying the signature over the parsed `@Body()` instead of `req.rawBody`.
- `prisma migrate dev`; editing a `@yarns/*` `src` without rebuilding its `dist`.
- Declaring done off a green typecheck/build/unit run without the boot smoke.

## Checklist

- [ ] Work-unit classified; every fitting guide read.
- [ ] Cross-domain links id-only; cross-domain behaviour via a seam token or an event – no foreign imports.
- [ ] Each new/changed endpoint thin + `@RequirePermission` + class-validator DTO.
- [ ] State write + `outbox.append(tx, …)` in one `$transaction`; FSM guard on a `FOR UPDATE` row.
- [ ] Jobs deterministic-id + payload-guarded; webhooks verify `rawBody` + claim/release.
- [ ] Migrations additive via `migrate deploy`; client regenerated; edited `@yarns/*` packages rebuilt.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md` with evidence, incl. `app.module.boot.spec.ts`.
