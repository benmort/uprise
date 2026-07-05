---
name: testing-unit
description: Unit-test a uprise service with a hand-mocked Prisma client, plus the boot smoke that the unit tests can't replace.
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

## The coverage gate

`pnpm coverage:check` (`scripts/coverage-check.mjs`) is part of "done" whenever you touch instrumented source. It is what makes "new behaviour gets a test" mechanical rather than aspirational, and it runs off the same jest/vitest coverage the suite already produces.

- **Two rules, per package with changed source.** (1) *Patch floor* – the new/changed executable lines (vs the base branch, incl. uncommitted work) must be **≥ 80 %** covered. (2) *No regression* – the package's total line % must stay at/above the committed value in `coverage-baseline.json` (repo root). Both must hold or the gate exits non-zero.
- **Instrumented scope.** `apps/api/src/**` (all of it – backend logic is unit-testable), `apps/admin/src/lib` and `packages/field/src/lib` (the logic layer only; React views/pages are Playwright e2e's job, not vitest). Specs, `src/scripts`, `main.ts` are excluded (jest `coveragePathIgnorePatterns`); coverage forces every in-scope file into the report (`collectCoverageFrom` / vitest `coverage.all`) so a brand-new untested file reads as all-missed, not absent.
- **Run it.** `pnpm coverage:check` generates coverage for exactly the packages whose source you changed, then checks – it's instant when you changed no instrumented source, and only runs the one package you touched otherwise. `--no-run` checks pre-generated artifacts (CI). `--base=<ref>` / `--floor=<n>` override the defaults (base `origin/main`, floor 80).
- **Same commit.** The test lands with the code. Adding a service now and its spec in a follow-up commit fails the gate on the first commit.
- **Ratcheting up.** When your tests genuinely raise total coverage, run `pnpm coverage:check --update-baseline` and commit the bumped `coverage-baseline.json` – the baseline only ever moves up, so coverage can't silently erode later.

## Anti-patterns
- A real DB or live Stripe/Twilio in a unit spec – mock the client and the SDK service.
- Shipping new source in one commit and its tests in the next – the coverage gate is per-commit; the test ships WITH the code.
- `$transaction: jest.fn()` that returns `undefined` – the callback never runs, so nothing under test executes.
- Asserting only the return value while the real contract is "it emitted the outbox event / locked the row".
- Treating green unit tests as proof DI is wired – it is not; run the boot smoke.

## Checklist
- [ ] Service constructed with `new` and positional mocks.
- [ ] `$transaction` mock matches the form(s) the service uses (callback and/or array).
- [ ] New behaviour has a test; FSM-guard + idempotency cases covered.
- [ ] `pnpm --filter api test` green, INCLUDING `app.module.boot.spec.ts`.
- [ ] `pnpm coverage:check` green (patch ≥ 80 %, no total regression); baseline ratcheted + committed if coverage rose.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/api/dev/ai/how-to/services-controllers-dtos.md` – the services under test.
- `apps/api/dev/ai/how-to/module-wiring.md` – what the boot smoke verifies.
- `apps/api/dev/ai/how-to/state-machines.md` – the FSM guards to assert against.
