# 12 – Drizzle → Prisma Translation & Testing

Cross-cutting reference, written alongside the foundation. Patterns every domain port (docs 06–11) follows.

## Parity checklist (definition of done)

Full functional parity with prog is mandatory (doc 00 Mandate). For each prog domain, build a checklist from prog's own catalogues and do not close the milestone until every line is ported and tested:

1. **Handlers** – enumerate every handler in `prog/.../apps/platform/src/services/<domain>/` (e.g. tenant has 25+, identity 25+, payment 15+). Each becomes a yarns service method or controller route. Tick when ported + tested.
2. **Events** – enumerate every event the domain publishes (the `*.events.ts` / `event-types.ts` entries). Each becomes a `@yarns/events` catalogue entry emitted via the outbox at the right transition.
3. **Reactions** – enumerate prog's cross-domain reactions (`prog/.../reactions/`). Each becomes a yarns `Reaction` (doc 05) – e.g. `UserCreated → SendWelcomeEmail`, `SubscriptionCreated → UpdateTenant`.
4. **FSM transitions** – every transition in the prog aggregate's `TransitionMap` exists in the yarns `*-state.machine.ts`.
5. **Webhook event types** – every provider event type prog handles is handled in yarns.
6. **Adapter surface** – every method on prog's adapter (SendGrid/Stripe/Twilio) has a yarns equivalent.

A domain is "done" only when its checklist is fully ticked and the yarns suite is green. Record the checklist in the domain's PR description.

## No-regression gate

Every foundation step and milestone must leave the **entire** existing yarns suite green – api jest, web vitest, Playwright e2e – plus a manual smoke of the existing surfaces (audiences, blasts, contacts, inbox, whatsapp, canvassing, journeys, geo, integrations, analytics, compliance). A port is not complete if it turns an existing test red.

## Drizzle → Prisma translation

| prog (Drizzle) | yarns (Prisma) |
|---|---|
| `platform.table('x_view', …)` CQRS projection | a single `model X` – collapse aggregate + read-model into ONE CRUD row; drop the `_view` suffix. |
| `uuid('id').primaryKey().defaultRandom()` | `String @id @default(cuid())` – yarns uses cuid everywhere, not uuid. |
| `timestamp(..,{withTimezone:true})` | `DateTime` (`@default(now())` / `@updatedAt`). |
| `jsonb('x')` | `Json?` (recipientList, metadata, ruleDefinition, source-record data). |
| `text('status')` free-text FSM | a Prisma **enum** + a `*-state.machine.ts` guard (below). |
| 3× `*_webhook_events` tables with `unique(provider,eventId)` | ONE `WebhookEvent`, `@@unique([provider,eventId])` (below). |
| `claimOnce((provider,eventId))` | `WebhookEventService.claim()` – insert + catch P2002 (reuse the P2002 idiom in `apps/api/src/blasts/blasts.service.ts`). |
| `assertTransition(MAP, from, to)` | `assertValid<X>Transition` in `*-state.machine.ts` – same map, service-level. |
| `repo.save(aggregate)` (append events) | `prisma.$transaction([ update(row), outbox.append(tx, event) ])` – row is truth, event is choreography (doc 05). |
| `*_events`, `eventOutbox`, `reactionsDedup` | NOT ported per-domain – the foundation owns outbox/reactions (doc 05); domains only EMIT. |
| `networkId` (Stripe customer per Network) | keep `Customer.networkId` as the billing boundary above tenant (doc 03). |

## FSM port pattern

yarns already does the row-level version in `apps/api/src/blasts/blast-state.machine.ts` + `assertValidBlastTransition`. For each ported aggregate:

1. Status → Prisma enum.
2. prog's `TransitionMap` → a `*-state.machine.ts`, copied **verbatim** (the maps are correct).
3. Transition method on the service: load row → `assertValid…Transition(row.status, next)` → update row + outbox event in one `$transaction` (replaces `aggregate.raise()` + `repo.save()`).
4. Idempotency: prog's "InvalidTransition = already-processed" becomes – catch the guard error in webhook handlers and swallow (no-op).

Add once: `apps/api/src/common/fsm/assert-transition.ts` – a generic `assertTransition(map, from, to)` generalising the blast one.

## Webhook dedup (`ops` schema)

One table replaces prog's three `*_webhook_events`:

```prisma
model WebhookEvent {
  id         String   @id @default(cuid())
  provider   String                                 // "sendgrid" | "stripe" | "twilio"
  eventId    String                                 // sg_event_id | evt_… | MessageSid/CallSid
  receivedAt DateTime @default(now())
  @@unique([provider, eventId])
  @@schema("ops")
}
```

`WebhookEventService.claim(provider, eventId)` = insert + catch P2002 → returns `false` if already claimed. Extend the existing `apps/api/src/webhooks/webhooks.controller.ts` (already validates Twilio signatures) with `/email-webhook`, `/payment-webhook`, `/voice-status-callback`. Each: verify provider signature → `claim` → dispatch to owning service → 200.

## Idempotency checklist (per ported webhook)

1. `@@unique([provider,eventId])` on `WebhookEvent`.
2. `claim` BEFORE acting.
3. Lost claim = silent no-op (already processed).
4. FSM-guard error in handler = swallow (already terminal).
5. Email open/click = first-write-wins timestamp, not FSM.

## Adapters

- **Twilio** – already real (`twilio.service.ts`). Extend (`sendTransactional`, `placeCall`); do NOT port prog's Noop adapter to production.
- **SendGrid** (doc 07), **Stripe** (doc 08) – net-new real services modelled on `TwilioService` (config-gated, `withRetry`, `ServiceUnavailableException` when unconfigured).
- prog's Noop adapters survive only as **test doubles**.

## Testing strategy

yarns uses jest for api (unit + `*.integration.spec.ts` with mocked Prisma), jest-e2e (`apps/api/src/e2e/*.e2e.spec.ts`), vitest for web, Playwright for browser e2e.

- **State-machine unit tests** – copy `blast-state.machine.spec.ts` per machine: every legal transition passes, every illegal throws. prog's maps are the fixtures.
- **Service integration tests** (mocked Prisma + mocked adapter) – mirror `blasts.integration.spec.ts`: correct FSM transition, outbox event written in the same tx, idempotent no-op on replay.
- **Webhook idempotency tests** – claim-once dedup; already-terminal swallowed; email open/click first-write-wins; SendGrid `.filterN` suffix strip; Stripe `charge.refunded` partial vs full.
- **Transactional-SMS invariants** (doc 06, priority) – STOP'd/suppressed number still receives; `ConsentService`/`ComplianceService` never invoked; transactional sender used; analytics `kind` split excludes it from marketing.
- **Outbox/reactions** (doc 05) – atomic append; relay publishes; reaction fires once; `ReactionDedup` blocks replay.
- **e2e** – one happy path per domain using prog's Noop adapters as doubles (2FA send→verify; email send→webhook→delivered; Stripe checkout→webhook→subscription).
