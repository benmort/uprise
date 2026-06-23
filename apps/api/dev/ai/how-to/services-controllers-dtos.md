---
name: services-controllers-dtos
description: Build a yarns backend slice – thin controller, service that owns the logic, class-validator DTO, cross-domain sends via the dispatcher seam.
layer: api
topic: service-shape
use_when: Adding or changing a backend endpoint, service method, DTO, or a cross-domain transactional send.
last_reviewed: 2026-06-23
---

# Services, controllers, DTOs

How to shape a backend slice: a thin controller, a service that owns logic + transactions, a validated DTO, and the seam for cross-domain sends.

Canonical: `apps/api/src/payment/payment.service.ts` (the `ensureOrganization` tenant pattern, `$transaction` + `OutboxService.append` + `assertValidPaymentTransition`), `apps/api/src/payment/payment.controller.ts` (`@RequirePermission` thin controller), `apps/api/src/messaging/dto/message-template.dto.ts` (class-validator DTO), `apps/api/src/messaging/transactional-dispatcher.ts` (the `TRANSACTIONAL_DISPATCHER` consent-exempt seam).

## Must have
- **Thin controllers.** A controller method binds the route, validates the body via a DTO, and delegates to the service – no business logic. See `PaymentController`: every handler is one line into `PaymentService`/`StripeService`.
- **Always tag the route with `@RequirePermission`.** Permission-gating is opt-in – `AbilityGuard` allows any un-decorated route (`if (!required) return true`), so a missing decorator silently leaves it reachable by any authenticated user, and nothing catches that at boot. `PaymentController` defines `MANAGE`/`READ` consts (`{ action, resource: "payment.all" }`) and tags every route. The only un-decorated routes are deliberate, justified public-allowlist entries (webhooks/cron). See `apps/api/dev/ai/how-to/permissions.md`.
- **Services own the logic + the transaction.** State writes run inside `this.prisma.$transaction(async (tx) => …)`, and a domain event is appended via `this.outbox.append(tx, { tenantId, eventType, aggregateId, payload })` in the SAME transaction (`PaymentService.markSucceeded`, `recordPayment`, `refund`).
- **FSM transitions go through the guard.** Call `assertValidPaymentTransition(current, next)` (or the domain's equivalent) on a row loaded `FOR UPDATE` via `lockAndLoad` before writing – never branch on status ad hoc.
- **Tenant resolution.** Multi-tenant reads/writes scope to the tenant; `ensureOrganization()` upserts the default org from `DEFAULT_ORGANIZATION_SLUG` and every list query filters `where: { tenantId: org.id }`.
- **DTOs are class-validator.** Inputs are classes decorated with `@IsString`, `@IsEnum`, `@IsOptional`, `@IsArray()` + `@IsString({ each: true })` for primitive arrays, and `@ValidateNested({ each: true })` + `@Type(() => Dto)` for nested arrays – see `CreateMessageTemplateDto` (in `apps/api/src/messaging/dto/message-template.dto.ts`) and the inline `CheckoutSessionDto`/`LineItemDto` in `payment.controller.ts`. No hand-rolled `if (!body.x)` validation.
- **Cross-domain sends go via the dispatcher seam.** To send a transactional message (2FA, verification code, receipt) from another domain, inject the `TRANSACTIONAL_DISPATCHER` token and call `sendSms`/`sendEmail` – never import the messaging internals or `ConsentService`. This path is deliberately consent/compliance/suppression-exempt: a transactional message is legally allowed to a STOP'd number, at any hour.

## Anti-patterns
- Business logic in the controller (querying Prisma, looping recipients) – push it into the service.
- A new endpoint without `@RequirePermission` – the guard will not stop it, so it is open to any authenticated user. The omission is a hole, not a default.
- Emitting a domain event outside the `$transaction` that wrote the row – a crash between them loses the event.
- Reading raw `req.body` or validating by hand instead of a class-validator DTO.
- A marketing/consented domain importing the transactional dispatcher (or vice-versa: routing consented sends through it to dodge consent).

## Checklist
- [ ] Controller is thin; each route has `@RequirePermission` (or a justified allowlist entry).
- [ ] State write + its domain event are in one `$transaction` via `outbox.append(tx, …)`.
- [ ] Status changes go through the FSM guard on a locked row.
- [ ] Inputs are class-validator DTOs.
- [ ] Cross-domain transactional sends inject `TRANSACTIONAL_DISPATCHER`, not messaging internals.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/api/dev/ai/how-to/transactions.md` – atomic state+event writes and row locks.
- `apps/api/dev/ai/how-to/permissions.md` – `@RequirePermission` and CASL.
- `apps/api/dev/ai/how-to/state-machines.md` – the FSM guards.
- `apps/api/dev/ai/how-to/module-wiring.md` – wiring the module the service lives in.
