---
name: testing-unit
description: Unit-test a yarns service with a hand-mocked Prisma client, plus the boot smoke that the unit tests can't replace.
layer: api
topic: testing
use_when: Writing or changing a backend service spec, or adding behaviour that needs a test.
last_reviewed: 2026-06-23
---

# Backend unit testing

How to unit-test a domain service against a mocked Prisma client, and why the boot smoke is part of the gate.

Canonical: `apps/api/src/payment/payment.service.spec.ts` (the `setup()` mocked-prisma factory), `apps/api/src/blasts/blasts.integration.spec.ts` (positional construction with mocked collaborators), `apps/api/src/app.module.boot.spec.ts` (the DI boot smoke).

## Must have
- Construct the service directly with `new`, passing mocks positionally – `new PaymentService(prisma, outbox, webhookEvents, billing, logger, config, stripe)`. No `Test.createTestingModule` for a plain service spec.
- Mock Prisma as a plain object whose model methods are `jest.fn()`. Reproduce the transaction seam exactly:
  - callback form: `$transaction: (cb) => cb(prisma)` (Blasts), so code under test runs against the same mock; or
  - both forms: `$transaction: (arg) => Array.isArray(arg) ? Promise.all(arg) : arg(prisma)` (Payment) when the service also passes an array of promises.
- Mock collaborators as the shape the service actually calls – `{ append: jest.fn() }` for the outbox, `{ claim: jest.fn(async () => true), release: jest.fn() }` for `WebhookEventService`, a `ConfigService` whose `get(key, fallback)` returns the fallback.
- Sequence mock returns when one method is called several times in a flow: `findMany.mockResolvedValueOnce(...).mockResolvedValueOnce([])` (see the Blasts send flow). Order matters – it encodes the call order.
- Assert on the mock, not just the return: `expect(outbox.append).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: "payment.payment.succeeded" }))`; `expect(prisma.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED" }) }))`.
- Test the FSM guard and idempotency, not only the happy path: an illegal transition rejects (`FAILED→SUCCEEDED`), a duplicate (`P2002`) is a no-op, a re-delivered webhook makes zero updates.
- New behaviour gets a test. Optional-with-fallback constructor deps (e.g. Blasts' `flags`, `queue`) let specs construct positionally without them – keep them last and optional.
- The boot smoke is part of the gate. Unit tests `new` services with mocks, so they NEVER exercise Nest DI – only `app.module.boot.spec.ts` does. Run the whole api suite.

## Anti-patterns
- A real DB or live Stripe/Twilio in a unit spec – mock the client and the SDK service.
- `$transaction: jest.fn()` that returns `undefined` – the callback never runs, so nothing under test executes.
- Asserting only the return value while the real contract is "it emitted the outbox event / locked the row".
- Treating green unit tests as proof DI is wired – it is not; run the boot smoke.

## Checklist
- [ ] Service constructed with `new` and positional mocks.
- [ ] `$transaction` mock matches the form(s) the service uses (callback and/or array).
- [ ] New behaviour has a test; FSM-guard + idempotency cases covered.
- [ ] `pnpm --filter api test` green, INCLUDING `app.module.boot.spec.ts`.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/api/dev/ai/how-to/services-controllers-dtos.md` – the services under test.
- `apps/api/dev/ai/how-to/module-wiring.md` – what the boot smoke verifies.
- `apps/api/dev/ai/how-to/state-machines.md` – the FSM guards to assert against.
