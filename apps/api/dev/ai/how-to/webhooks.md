---
name: webhooks
description: How to add a provider webhook in uprise – verify the raw-body signature, claim-before-act idempotency, release on throw.
layer: api
topic: webhooks
use_when: Adding or changing any inbound provider webhook (Stripe, SendGrid, Twilio).
last_reviewed: 2026-06-23
---

# Webhooks

A provider webhook is public-allowlisted, so its only protection is the signature; processing must be replay-safe via a claim that releases on failure.

Canonical: `apps/api/src/webhooks/webhooks.controller.ts` (`paymentWebhook`/`emailWebhook` read `req.rawBody`, verify the signature, then delegate to `PaymentService.processStripeEvent` / `EmailService.processSendGridEvents`; `validateTwilioSignature` uses `twilio.validateRequest` for the Twilio hooks), `apps/api/src/common/webhooks/webhook-event.service.ts` (`WebhookEventService.claim(provider, eventId)` inserts a `(provider, eventId)` row and returns false on `P2002`; `release()` `deleteMany`s it – called from inside the services, not the controller), `apps/api/src/payment/stripe.service.ts` (`verifyWebhookSignature`: HMAC-SHA256 over `${timestamp}.${rawBody}`, `timingSafeEqual`, 300s tolerance), `apps/api/src/email/sendgrid.service.ts` (`verifyEventWebhookSignature`: ECDSA-P256/SHA-256 via `createVerify` over `timestamp + rawPayload`; `isWebhookVerificationConfigured` gates it).

## Must have
- Verify the signature over the RAW request body (`req.rawBody`), never the parsed `@Body()`. Parse only after verification passes. `rawBody` is enabled in `main.ts`.
- Reject when the verifying secret/key is unconfigured or the signature fails – `throw new UnauthorizedException(...)` (see `paymentWebhook` requiring `STRIPE_WEBHOOK_SECRET`). Never process unsigned events.
- `claim(provider, eventId)` BEFORE acting; if it returns false the event is a replay – skip it. Do the side effects only after a successful claim.
- If processing throws AFTER a successful claim, `release(provider, eventId)` so the provider's retry reprocesses it – otherwise the event is marked seen but never applied (silent loss, critical for payments).
- Add the new path to `isPublicWebhookPath` in `basic-auth.guard.ts` (both the bare path and the `/api/v1`-prefixed one).

## Anti-patterns
- Verifying against `JSON.stringify(body)` – re-serialisation changes bytes and the HMAC/ECDSA check fails.
- Claiming and not releasing on error – the retry is a no-op and the event is lost.
- Acting first and claiming after – a duplicate delivery double-applies before the claim lands.
- Comparing signatures with `===` – use the provider methods' constant-time compare (`timingSafeEqual`).

## Checklist
- [ ] Signature/HMAC/ECDSA verified over `req.rawBody`; unconfigured secret or bad signature throws `UnauthorizedException`.
- [ ] `claim` before side effects; replay (false) is skipped; `release` in the catch path.
- [ ] Path added to `isPublicWebhookPath` (bare + `/api/v1`).
- [ ] No secret or PII logged.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/api/dev/ai/how-to/permissions.md` – why webhooks live in the allowlist, not `@RequirePermission`.
- `apps/api/dev/ai/how-to/bullmq-jobs.md` – handing webhook-derived work to the worker.
