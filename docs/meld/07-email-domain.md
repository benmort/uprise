# 07 – Transactional Email (net-new)

M1. The email counterpart of transactional SMS (doc 06). Net-new email domain providing **transactional email** — verification codes, magic-links, password-reset, receipts, invitations. Nothing comparable exists in uprise.

## Parity with transactional SMS (doc 06)

Transactional email is the same class of message as transactional SMS, on the email channel:

| | Transactional SMS (doc 06) | Transactional email (this doc) |
|---|---|---|
| Consent/compliance/suppression | **bypassed** (consent-exempt) | **bypassed** (consent-exempt) |
| Dispatcher seam | `TRANSACTIONAL_DISPATCHER.sendSms` | `TRANSACTIONAL_DISPATCHER.sendEmail` |
| Sender | `TWILIO_TRANSACTIONAL_FROM` | `SENDGRID_FROM_EMAIL` |
| Lifecycle FSM | `TxSmsStatus` | `EmailStatus` |
| Ledger | `OutboundMessage` (kind=TRANSACTIONAL) | `Email` |

**Invariant** (same as transactional SMS): transactional email is legally service mail — it MUST reach the recipient regardless of any marketing-consent state, with no opt-out footer. `EmailService` takes no consent/compliance/suppression dependency. Marketing/newsletter email is a **separate, future** concern (the email analogue of blasts) and is out of scope here — this domain is transactional-only.

Source: `/Users/benjaminmort/code/prog/core-orchestration/apps/platform/src/services/email/*` (`email-message.aggregate.ts`, `templates.ts`, `process-webhook.handler.ts`, `SendGridAdapter`).

## Models (`email` schema)

```prisma
enum EmailStatus { QUEUED SENDING SENT DELIVERED BOUNCED FAILED }  // prog email-message.aggregate.ts:201

model Email {
  id                String      @id @default(cuid())
  tenantId          String
  contactId         String?                          // id-only ref to public.Contact
  toAddress         String
  subject           String
  status            EmailStatus @default(QUEUED)
  providerMessageId String?
  templateKey       String?
  openedAt          DateTime?                         // first-write-wins, NOT a status
  clickedAt         DateTime?                         // first-write-wins, NOT a status
  bounceReason      String?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  @@index([tenantId, status])
  @@index([providerMessageId])
  @@schema("email")
}

model EmailTemplate {
  id        String   @id @default(cuid())
  tenantId  String
  key       String                                    // welcome, magic_link, verification, ...
  subject   String
  body      String   @db.Text
  isActive  Boolean  @default(true)
  @@unique([tenantId, key])
  @@schema("email")
}
```

`open`/`click` are timestamps (first-write-wins), not FSM states – exactly prog. Status FSM: `QUEUED→SENDING→SENT→DELIVERED|BOUNCED|FAILED` in `email-state.machine.ts` (doc 12 pattern).

## Module

`apps/api/src/email/`:

- `email.service.ts` – `queue()` → `QUEUED` + outbox; `send()` → `SENDING→SENT` via SendGrid, stamps `providerMessageId` + outbox `email.sent`.
- `email.controller.ts` – template CRUD, send-test.
- `sendgrid.service.ts` – net-new adapter modelled on `TwilioService`: real `@sendgrid/mail`, config-gated, `withRetry` (`apps/api/src/common/utils/retry.utils.ts`), `ServiceUnavailableException` when unconfigured. Port prog's `SendGridAdapter` surface (`send`, `sendTemplate`). prog's Noop adapter survives only as a test double (doc 12).
- `email-templates.ts` – seed the prog template keys: `welcome`, `magic_link`, `verification`, `invitation`, `recovery`, `contact_form`, `demo_request`, `newsletter`.
- `email-state.machine.ts` – FSM guard.

Transactional emails (magic-link, verification, receipts) are called via `TransactionalDispatcher.sendEmail` (doc 06) and sent **inline** (no queue — like a 2FA code, they're time-sensitive and single-recipient). Bulk/marketing email is out of scope (a future, separate domain).

## Webhook – `/email-webhook`

Port `process-webhook.handler.ts` verbatim onto uprise' webhook controller (doc 12 `WebhookEvent` + `claim`):

- Per-event `claim(provider='sendgrid', eventId=sg_event_id)`.
- Resolve the `Email` by `sg_message_id` (strip the `.filterN` suffix) → `providerMessageId`; fallback to an `emailId` custom-arg.
- Drive `markDelivered/Bounced/Failed/Opened/Clicked`. Handled event types: delivered, bounce, dropped, open, click.

## Worker queue

None — transactional email is sent inline (like transactional SMS). An `email-send` bulk queue belongs to the future marketing-email domain, not here.

## Verification

- FSM unit tests (legal pass / illegal throw).
- Webhook idempotency: claim-once dedup; replayed-terminal swallowed; `.filterN` suffix strip resolves the right `Email`; open/click first-write-wins (second event does not overwrite the timestamp).
- e2e happy path: queue → SendGrid (Noop double) → webhook → `DELIVERED`.

## Files

- `packages/db/prisma/schema.prisma` – `EmailStatus`, `Email`, `EmailTemplate`.
- `apps/api/src/email/**` – new module.
- `apps/api/src/webhooks/webhooks.controller.ts` – add `/email-webhook`.
- `apps/worker/src/main.ts` – add `email-send` worker.
