---
name: state-machines
description: How uprise models an aggregate lifecycle – a Prisma enum, a TransitionMap, a throwing guard, and a non-throwing twin for callbacks.
layer: api
topic: fsm
use_when: Adding or changing a status field whose transitions must be enforced, or wiring a provider status callback.
last_reviewed: 2026-06-23
---

# State machines

Each aggregate lifecycle is a Prisma status enum plus a `TransitionMap`; commands assert through a throwing guard, and replayable provider callbacks gate through a non-throwing twin.

Canonical: `apps/api/src/common/fsm/assert-transition.ts` (`TransitionMap<S>`, `assertTransition(map, from, to, code, label)` → 409 `ApiHttpException`); `apps/api/src/messaging/tx-sms-state.machine.ts` (`TX_SMS_TRANSITIONS`, `assertValidTxSmsTransition`, `canTransitionTxSms`); `apps/api/src/calls/call-state.machine.ts` (`CALL_TRANSITIONS`, `assertValidCallTransition`, `canTransitionCall`, `mapTwilioCallStatus`); `apps/api/src/email/email-state.machine.ts` (`EMAIL_TRANSITIONS`, `assertValidEmailTransition`, `canTransitionEmail`).

## Must have
- Model the lifecycle as a Prisma `enum` (`TxSmsStatus`, `CallStatus`, `EmailStatus`) and a `TransitionMap<TheEnum>` mapping each state to its allowed next states.
- Provide a throwing guard `assertValid<X>Transition(from, to)` wrapping `assertTransition(map, from, to, "INVALID_<X>_TRANSITION", "<label>")`; commands call it before the `update` (see `PaymentService.markSucceeded` → `assertValidPaymentTransition`).
- Provide a non-throwing twin `canTransition<X>(from, to): boolean` for callback paths, where an out-of-order or replayed status is a normal no-op, not a 409.
- Terminal states map to `[]` (no outgoing transitions): `CallStatus.COMPLETED`/`BUSY`/`NO_ANSWER`/`FAILED`, `EmailStatus.BOUNCED`/`FAILED`, `TxSmsStatus.DELIVERED`/`UNDELIVERED`/`FAILED`. A replayed terminal callback is swallowed.
- Map a provider's raw status to your enum (e.g. `mapTwilioCallStatus`); return `null` for statuses with nothing to transition, and `canTransition<X>`-gate before applying.

## Anti-patterns
- Mutating `status` with a raw `prisma.update` and no guard.
- Throwing `assertValid…` on a webhook/callback – a legitimate replay or out-of-order event becomes a 409; gate with `canTransition…` there instead.
- Giving a terminal state outgoing edges (other than a deliberate, commented exception like `EMAIL_TRANSITIONS` allowing `DELIVERED → BOUNCED` for a late hard-bounce).
- Encoding transitions as scattered `if`s instead of one `TransitionMap`.

## Checklist
- [ ] Prisma enum + `TransitionMap` defined; terminal states map to `[]`.
- [ ] Throwing `assertValid<X>Transition` used on command paths before the write.
- [ ] Non-throwing `canTransition<X>` used on callback/webhook paths; provider-status mapper returns `null` for no-ops.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/api/dev/ai/how-to/transactions.md` – guard + update + outbox in one transaction.
- `apps/api/dev/ai/how-to/outbox-and-reactions.md` – emitting on a successful transition.
