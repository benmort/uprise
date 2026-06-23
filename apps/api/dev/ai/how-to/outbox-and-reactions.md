---
name: outbox-and-reactions
description: How a state change becomes a cross-domain effect – transactional outbox emit, then an idempotent, loop-safe reaction.
layer: api
topic: events
use_when: A write needs a side-effect in another domain, or you are adding/registering a Reaction.
last_reviewed: 2026-06-23
---

# Outbox and reactions

A domain commits its event with its row via the transactional outbox; the worker later dispatches that event to idempotent, loop-safe reactions in other domains.

Canonical: `apps/api/src/common/outbox/outbox.service.ts` (`OutboxService.append(tx, evt)` → `tx.outboxEvent.create(...)`); `apps/api/src/common/reactions/reaction-registry.ts` (`ReactionRegistry.onModuleInit` calls `assertReactionsLoopSafe`; `dispatch(source, event)` claims `prisma.reactionDedup.create({ source, eventId })` then runs handlers); `apps/api/src/common/reactions/domain-reactions.ts` (`buildDomainReactions(deps)`); `packages/events/src/index.ts` (`EVENT_TYPES`, `DomainEventMap`, `Reaction`, `assertReactionsLoopSafe`).

## Must have
- Emit with `outbox.append(tx, …)` INSIDE the same `prisma.$transaction` that writes the row, so the event commits atomically with the change (see `PaymentService.markSucceeded` appending `payment.payment.succeeded` next to the `payment.update`).
- The `eventType` is a key of `DomainEventMap` and the `payload` matches its typed shape – `append` is generic over `DomainEventMap[K]`. Add the entry to `EVENT_TYPES` + `DomainEventMap` first.
- Reactions are **idempotent**: delivery is at-least-once; the registry claims `(source, eventId)` via the `ReactionDedup` unique and a `P2002` short-circuits a replay (`return`). Your handler must also tolerate re-running (no double-charge, no duplicate row).
- Reactions are **loop-safe**: a reaction's `emits` lists what it raises and must NOT include its own `trigger`. `welcomeEmailReaction` triggers `iam.user.created` and emits `email.email.queued` – different. Boot fails fast via `assertReactionsLoopSafe`.
- Register a new reaction in `buildDomainReactions` (or the relevant `REACTIONS` provider) so the registry indexes it by trigger.

## Anti-patterns
- `outbox.append` after the `$transaction` closes (or in a second transaction) – a crash between write and append silently loses the event.
- A handler that assumes exactly-once and isn't safe to replay.
- Setting `emits: ["<own trigger>"]` – boot throws "Loop-unsafe reactions".
- Letting a reaction throw to crash the consumer – `dispatch` catches and logs per-reaction; keep effects self-contained.
- Calling another domain's service synchronously instead of reacting to its event.

## Checklist
- [ ] Event type added to `EVENT_TYPES` + `DomainEventMap`; payload typed.
- [ ] `outbox.append(tx, …)` is inside the same `$transaction` as the state write.
- [ ] Handler is idempotent; `emits` excludes its own `trigger`; reaction registered in `buildDomainReactions`.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/api/dev/ai/how-to/transactions.md` – the atomic write + append.
- `apps/api/dev/ai/how-to/state-machines.md` – emitting on a guarded transition.
- `apps/api/dev/ai/how-to/domain-boundaries.md` – why events, not direct calls, cross domains.
