---
name: transactions
description: How yarns writes atomically – state-write plus outbox emit in one prisma.$transaction, with SELECT … FOR UPDATE closing concurrent-transition races.
layer: api
topic: persistence
use_when: Writing a state change that emits an event, or guarding an aggregate against concurrent transitions.
last_reviewed: 2026-06-23
---

# Transactions

A state change and its domain event commit together in one `prisma.$transaction`; a row whose status is contested is locked `FOR UPDATE` before its transition is checked.

Canonical: `apps/api/src/payment/payment.service.ts` – `lockAndLoad(tx, paymentId)` runs a `tx.$queryRaw` with `Prisma.sql` doing `SELECT id FROM payment."Payment" WHERE id = ... FOR UPDATE`, then loads the row; `markSucceeded`/`markProcessing`/`markFailed`/`refund` each open `this.prisma.$transaction(async (tx) => …)`, lock, `assertValidPaymentTransition`, `tx.payment.update`, then `outbox.append(tx, …)`.

## Must have
- Wrap the state-write in `this.prisma.$transaction(async (tx) => …)` and use `tx` (the `Prisma.TransactionClient`) for every read/write inside, never `this.prisma`.
- The state-write and its `outbox.append(tx, …)` are in the **same** transaction – atomic emit (see `apps/api/dev/ai/how-to/outbox-and-reactions.md`).
- For any status that two paths can race (a webhook + a manual command), `SELECT … FOR UPDATE` the row first (`lockAndLoad`), then run the FSM guard on the locked row – closes the TOCTOU where both pass a stale-status check and double-apply.
- NO external HTTP / provider SDK call inside the transaction (Stripe/Twilio/SendGrid) – those run before or after; a long round-trip holds the row lock and the connection. `PaymentService` calls Stripe outside `$transaction`, then projects.
- The array form `prisma.$transaction([op1, op2])` is fine for a set of independent writes with no read-then-decide between them (e.g. `setDefaultPaymentMethod` clearing then setting the default).

## Anti-patterns
- `outbox.append` outside the transaction that wrote the row – a crash between them loses the event.
- Reading status, deciding, then updating without `FOR UPDATE` on a row a webhook can also touch – a lost-update race.
- Awaiting a network/provider call inside `$transaction`.
- Using `this.prisma` instead of `tx` inside the callback – that write is outside the transaction.

## Checklist
- [ ] State-write + `outbox.append(tx, …)` in one `prisma.$transaction(async (tx) => …)`, all I/O via `tx`.
- [ ] Contested transitions lock with `Prisma.sql` `SELECT … FOR UPDATE` before the guard.
- [ ] No external HTTP inside the transaction.
- [ ] Unit test mocks `$transaction` as `(cb) => cb(prisma)` for the callback form (and `(ops) => Promise.all(ops)` for the array form); behaviour is covered.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/api/dev/ai/how-to/outbox-and-reactions.md` – the atomic emit this guarantees.
- `apps/api/dev/ai/how-to/state-machines.md` – the guard run on the locked row.
- `apps/api/dev/ai/how-to/domain-boundaries.md` – transactions stay within one schema.
