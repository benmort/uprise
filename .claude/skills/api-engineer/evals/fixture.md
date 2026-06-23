# Fixture – synthetic work-unit for the api-engineer eval

Hand this brief verbatim to the run under test. There is no board ticket – yarns works from a task brief / plan file.

**Synthetic / illustrative:** treat the premise below as given. It mirrors real yarns shapes (the payment domain, `PaymentStatus`, the `payment.payment.refunded` event) but the "no `REFUNDED` yet" framing is a constructed gap for the eval. Do NOT grep the live tree to confirm the gap exists – the real codebase may already carry these; the eval grades the routing-and-planning reasoning, not a literal absence claim.

---

**Brief: refunded-receipt**

Add a "refunded receipt" to the payment domain. When a refund is fully processed, the payment transitions to a `REFUNDED` state and emits a `payment.payment.refunded` event so the email domain can send the customer a refund-receipt email.

Take these as the world for this exercise (real shapes, constructed gap):

- The payment domain lives at `apps/api/src/payment/` with `payment.service.ts`, `payment.controller.ts`, and `payment-state.machine.ts`.
- `PaymentStatus` is a Prisma enum in the `payment` schema (`packages/db/prisma/schema.prisma`). For this exercise, assume the `REFUNDED` value and the transition into it are not yet wired – you are adding them.
- The email domain already sends templated emails by reacting to domain events.

Produce: the guides to read, the invariants this touches, and the slice (model/migration, then event, then state machine, then service, then reaction, then tests, then gate). Do not write the code – route and plan it.
