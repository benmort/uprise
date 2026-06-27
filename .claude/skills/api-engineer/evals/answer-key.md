# Eval – api-engineer

Grades a cold run of the `api-engineer` skill against a synthetic work-unit. The grader compares the run's output (the guides it says to read + the invariants it names + the slice it proposes) to this key. The grader does not see this file.

The fixture is synthetic and labelled so: it borrows real uprise shapes (the payment domain, `PaymentStatus`, the `payment.payment.refunded` event) but the "`REFUNDED` not yet wired" gap is constructed for the exercise. Grade the routing-and-planning reasoning, not whether the gap is literally true in the live tree.

## Fixture (the work-unit handed to the run)

See `fixture.md`. Verbatim brief:

> Add a "refunded receipt" to the payment domain. When a refund is fully processed, the payment transitions to a new `REFUNDED` state and emits a `payment.payment.refunded` event so the email domain can send the customer a refund-receipt email. No board ticket – work from this brief.

## What a correct run MUST do

### Guides it must cite (the load-bearing four)

A passing run names and routes to all of these by repo-relative path:

1. `apps/api/dev/ai/how-to/state-machines.md` – the new `REFUNDED` transition is a lifecycle change: add the enum value + `TransitionMap` edge, guard command paths with the throwing `assertValidPaymentTransition`.
2. `apps/api/dev/ai/how-to/transactions.md` – the refund state write runs in one `prisma.$transaction(async (tx) => …)` on a `FOR UPDATE`-locked row, with no provider SDK call inside.
3. `apps/api/dev/ai/how-to/outbox-and-reactions.md` – `payment.payment.refunded` is appended via `outbox.append(tx, …)` and consumed by an idempotent, loop-safe reaction in the email domain.
4. `apps/api/dev/ai/how-to/testing-unit.md` – the new transition + idempotency are unit-tested with a mocked Prisma client; the run also notes the `app.module.boot.spec.ts` gate.

### The atomic-emit invariant (must be stated)

The run must state, in substance: **the `REFUNDED` state write and the `payment.payment.refunded` outbox append happen in the SAME `prisma.$transaction`** (`outbox.append(tx, …)` inside the `tx` callback), so the event commits atomically with the state change and is never lost. Appending after the transaction closes or in a second transaction is explicitly wrong.

### Cross-domain seam (must be stated)

Email reacts to the `payment.payment.refunded` **event** – the payment domain does NOT import or call the email service directly. Cross-domain link is id-only / event-only. (Cites `apps/api/dev/ai/how-to/outbox-and-reactions.md` and/or `apps/api/dev/ai/how-to/domain-boundaries.md`.)

## Strong run also cites (bonus, not required to pass)

- `packages/dev/ai/how-to/events-catalogue.md` – add `payment.payment.refunded` to `EVENT_TYPES` + `DomainEventMap` (flat, serialisable, carries `tenantId`); rebuild `@uprise/events`.
- `apps/api/dev/ai/how-to/migrations.md` + `packages/dev/ai/how-to/db-and-prisma.md` – `ADD VALUE IF NOT EXISTS 'REFUNDED'` to the payment status enum via `migrate deploy`, not consumed in the same migration; regenerate the client.
- `apps/api/dev/ai/how-to/services-controllers-dtos.md` – thin controller + `@RequirePermission` on any new/changed endpoint.
- `dev/ai/how-to/definition-of-done.md` – the closing gate with evidence incl. the boot smoke.

## Grading

| Band | Criteria |
|---|---|
| Pass | Cites all four load-bearing guides AND states the atomic same-transaction emit AND the event-not-import cross-domain seam. |
| Strong | Pass, plus events-catalogue + migrations/db + DoD gate, and proposes the slice in order (enum+migration, then event type, then state-machine guard, then transactional service with `outbox.append(tx)`, then email reaction, then unit tests, then boot smoke). |
| Fail | Any of: misses state-machines, transactions, outbox-and-reactions, or testing-unit; OR places the `outbox.append` outside the transaction; OR has the payment domain call the email service directly instead of reacting to the event. |

## Automatic fail (board-free / uprise-not-slingshot tripwires)

The run fails outright if it:

- references a Plane board, story, epic, or any dev/product registry (uprise has none – the unit of work is the brief).
- prescribes any slingshot construct: `@Transactional`, `EntityManager`, `RequestContext`, MikroORM, `ZodValidationPipe`, admin-RPC-POST, or `BaseCommandHandler`. (uprise uses `prisma.$transaction(async tx => …)`, class-validator DTOs, `@RequirePermission` + CASL, `OutboxService.append(tx, …)`, enum + `*-state.machine.ts` FSMs, BullMQ `getXJobId` dedup, additive `migrate deploy` migrations.)
- recommends `prisma migrate dev`.
- emits an em-dash (the long-dash character that this file deliberately never prints) anywhere in its output, or writes in non-Australian English.
