# 07 – Email Domain (net-new)

M1. Net-new email domain – nothing comparable exists in yarns. Provides transactional email (magic-link, verification, receipts) and bulk/newsletter sends.

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

Transactional emails (magic-link, verification, receipts) are called via `TransactionalDispatcher.sendEmail` (doc 06) and sent inline. Bulk/newsletter sends go through the `email-send` worker queue.

## Webhook – `/email-webhook`

Port `process-webhook.handler.ts` verbatim onto yarns' webhook controller (doc 12 `WebhookEvent` + `claim`):

- Per-event `claim(provider='sendgrid', eventId=sg_event_id)`.
- Resolve the `Email` by `sg_message_id` (strip the `.filterN` suffix) → `providerMessageId`; fallback to an `emailId` custom-arg.
- Drive `markDelivered/Bounced/Failed/Opened/Clicked`. Handled event types: delivered, bounce, dropped, open, click.

## Worker queue

`email-send` (bulk/newsletter). Add `EmailService.processEmailSendJob` mirroring `BlastsService.processBlastSendQueueJob`. Transactional sends do not queue.

## Verification

- FSM unit tests (legal pass / illegal throw).
- Webhook idempotency: claim-once dedup; replayed-terminal swallowed; `.filterN` suffix strip resolves the right `Email`; open/click first-write-wins (second event does not overwrite the timestamp).
- e2e happy path: queue → SendGrid (Noop double) → webhook → `DELIVERED`.

## Files

- `packages/db/prisma/schema.prisma` – `EmailStatus`, `Email`, `EmailTemplate`.
- `apps/api/src/email/**` – new module.
- `apps/api/src/webhooks/webhooks.controller.ts` – add `/email-webhook`.
- `apps/worker/src/main.ts` – add `email-send` worker.
