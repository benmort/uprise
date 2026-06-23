---
name: domain-boundaries
description: How yarns keeps domains decoupled – one Postgres schema namespace and one Nest module per domain, joined only by id and event.
layer: api
topic: architecture
use_when: Adding a model, wiring a new module, or reaching for another domain's data/service.
last_reviewed: 2026-06-23
---

# Domain boundaries

yarns is a modular monolith: each domain owns one Postgres `@@schema` namespace and one `apps/api/src/<domain>/` module, and the only links between them are an id string or a domain event.

Canonical: `packages/db/prisma/schema.prisma` (`datasource.schemas = ["public", "iam", "tenant", "audience", "messaging", "canvass", "journey", "integration", "analytics", "events", "email", "ops", "payment", "telephony"]`; every model carries `@@schema("<domain>")`); `apps/api/src/<domain>/` (e.g. `payment/`, `email/`, `journeys/`); `apps/api/src/journeys/journey-trigger.port.ts` (`JOURNEY_TRIGGER_PORT` + `JourneyTriggerPort`).

## Must have
- Every model declares its `@@schema("<domain>")` matching one of the `datasource.schemas` names; the module that owns it lives in `apps/api/src/<that-domain>/`.
- A reference to a row in another schema is an **id-only `String`** with NO `@relation` and NO foreign key – e.g. `Payment.tenantId`/`networkId`/`subscriptionId`/`invoiceId` and `Contact.gnafPid` (comment: "links to geo.gnaf_address"). `@relation`/FKs are allowed only inside the same schema (e.g. `Refund.payment` → `Payment`, both `payment`).
- To use another domain's behaviour, depend one-way on a **seam token** it provides (the `journeys` module binds `JOURNEY_TRIGGER_PORT` to `JourneyTriggerPort`; callers `@Inject(JOURNEY_TRIGGER_PORT)`), or react to its **domain event** via the outbox. Never the concrete service.
- Resolve a cross-domain id with your own `prisma` read, not by importing the other module's repository.

## Anti-patterns
- A `@relation` whose two models carry different `@@schema(...)` values – that is a cross-schema FK; keep it id-only.
- `import { EmailService } from "../email/email.service"` (or any other domain's service/model) inside a service – creates a module cycle and couples lifecycles. Go via a port token or an event.
- A model with no `@@schema(...)`, or one whose schema name is missing from `datasource.schemas`.
- Cascading deletes across domains via FK – there is no FK; clean up by reacting to the owner's `*.deleted` event.

## Checklist
- [ ] New model has `@@schema("<domain>")`; its name is in `datasource.schemas`; it sits under the matching `apps/api/src/<domain>/`.
- [ ] Every cross-schema link is a bare id `String` (no `@relation`, no FK); intra-schema relations only.
- [ ] No import of another domain's service/model; cross-domain calls go through a `*.port.ts` token or a reaction.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/api/dev/ai/how-to/outbox-and-reactions.md` – the event seam between domains.
- `apps/api/dev/ai/how-to/transactions.md` – atomic state-write + event within one schema.
- `dev/ai/how-to/domain-modelling.md` – how to shape a new domain.
