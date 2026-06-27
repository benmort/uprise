---
name: domain-modelling
description: How to model a new backend domain in uprise – schema namespace, id-only boundaries, events, and FSM – before cutting code.
layer: root
topic: process
use_when: Adding a new backend domain or a substantial new aggregate.
last_reviewed: 2026-06-23
---

# Domain modelling

How to shape a new uprise domain before writing it. uprise is a modular monolith: each domain is a Prisma schema namespace + a Nest module under `apps/api/src/<domain>/`.

Canonical: `packages/db/prisma/schema.prisma` (the `@@schema(...)` namespaces) + any `apps/api/src/<domain>/` module (e.g. `payment`, `telephony`).

## Must have

- **Pick the schema namespace.** Models get `@@schema("<domain>")` (public, iam, tenant, audience, messaging, canvass, journey, integration, analytics, events, email, ops, payment, telephony – the `schemas` list in `packages/db/prisma/schema.prisma`). Cross-domain references are **id-only** – a `String` holding the other row's id, never a cross-schema FK.
- **Decide the lifecycle.** If the aggregate has states, model them as a Prisma enum + a `*-state.machine.ts` (see `apps/api/dev/ai/how-to/state-machines.md`), not free-form string updates.
- **Decide the events.** What other domains need to know about → add typed entries to `@uprise/events` (`packages/dev/ai/how-to/events-catalogue.md`) and emit them via the outbox on the state writes.
- **Decide reactions.** Cross-domain side-effects are reactions (`apps/api/dev/ai/how-to/outbox-and-reactions.md`), not inline calls into another domain's services.
- **Module + DI.** A Nest module under `apps/api/src/<domain>/`; if other domains inject it, expose a seam (token) rather than importing internals. Confirm the `app.module.boot.spec.ts` boot smoke still passes.

## Anti-patterns

- A cross-schema foreign key, or importing another domain's entities/services directly.
- A status column mutated by free `update()` calls instead of an FSM.
- Inline cross-domain side-effects instead of an event + reaction.

## Checklist

- [ ] Schema namespace chosen; cross-domain refs id-only.
- [ ] Lifecycle modelled as enum + state machine (if stateful).
- [ ] Events added to `@uprise/events`; emitted via the outbox.
- [ ] Cross-domain effects modelled as reactions.
- [ ] Module wired; boot smoke green.

## Related guides

- `apps/api/dev/ai/how-to/domain-boundaries.md`, `apps/api/dev/ai/how-to/outbox-and-reactions.md`, `apps/api/dev/ai/how-to/state-machines.md`, `apps/api/dev/ai/how-to/module-wiring.md`.
- `packages/dev/ai/how-to/events-catalogue.md`.
