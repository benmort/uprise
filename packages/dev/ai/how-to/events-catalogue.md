---
name: events-catalogue
description: How to add and consume a typed domain event in @uprise/events.
layer: packages
topic: events
use_when: Adding a new domain event, or typing a Reaction handler against an event payload.
last_reviewed: 2026-06-23
---

# Events catalogue

`@uprise/events` is the single typed contract for the outbox/reactions backbone – every emitted event and every `Reaction` is generic over it.

Canonical: `packages/events/src/index.ts` – `EVENT_TYPES`, `DomainEventMap`, `EventEnvelope<P>`, `TypedEventEnvelope<K>`, `Reaction`, `loopUnsafeReactions`, `assertReactionsLoopSafe`.

## Must have
- Name events `<domain>.<thing>.<pastTenseVerb>`, dot-separated, matching the domain's schema namespace (e.g. `audience.imported`, `messaging.blast.sent`).
- Add an event in two places together: a key in `EVENT_TYPES` (the const used at call sites) and a matching entry in `DomainEventMap` keyed by the literal event-type string, giving the payload its typed shape.
- Every payload carries `tenantId` (every existing `DomainEventMap` entry does, except network/tenant-level events that use `networkId`); keep payloads flat and serialisable – they cross a queue as JSON.
- After editing `src/index.ts`, rebuild the package: `pnpm --filter @uprise/events build`. The api and worker import the built `dist`, so an unbuilt change is invisible to them.
- Consumers receive a loosely-typed `EventEnvelope` (`payload: unknown`) – a `Reaction.handle` must narrow `event.payload` to the known `DomainEventMap` shape before use; do not assume the type.
- A `Reaction` declaring `emits` must not list its own `trigger`. The registry runs `assertReactionsLoopSafe` at boot, so a self-loop fails fast.

## Anti-patterns
- Adding to `EVENT_TYPES` without a `DomainEventMap` entry – call sites stay typed as `string`, losing the payload contract.
- Editing `src/` and not rebuilding `dist` – the api/worker still see the old catalogue (see definition-of-done).
- Reading `event.payload` as the typed shape without narrowing – it is `unknown` at the boundary.
- A reaction that emits its event back into its own trigger (immediate loop).

## Checklist
- [ ] New `EVENT_TYPES` key + matching `DomainEventMap` entry, name follows `<domain>.<thing>.<verb>`.
- [ ] Payload flat, serialisable, carries `tenantId` (or `networkId`).
- [ ] `pnpm --filter @uprise/events build` run so api/worker pick it up.
- [ ] Consumer reactions narrow `event.payload`; any `emits` excludes the trigger.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `packages/dev/ai/how-to/package-build.md` – why the rebuild is mandatory.
- `dev/ai/how-to/definition-of-done.md` – the atomic state+event rule.
