# 06 – Transactional Messaging (priority)

M1. Model prog's 2FA/verification SMS as a distinct message class that **bypasses consent, compliance, and suppression**. This is the user's explicit priority.

## Problem

uprise has **only** marketing SMS: every send goes through `BlastsService`, applying consent (`apps/api/src/messaging/consent.service.ts` `canSend`), compliance (`apps/api/src/compliance/compliance.service.ts` `validateMessageForSend` – STOP-language + quiet hours), and suppression.

prog's 2FA path sends straight to the provider with no consent/STOP/suppression/quiet-hours:

```ts
// prog: services/identity/application/mobile-verification.handler.ts:28
await this.dispatcher.sendSms(command.mobile, `Your verification code is ${code}`);
```

A verification code **must** reach a STOP'd/suppressed number, at any hour, with no "Reply STOP" footer. AU service/transactional messages are legally exempt from marketing-consent rules. These are genuinely distinct message classes.

## Models (`messaging` schema)

```prisma
enum MessageKind { MARKETING TRANSACTIONAL }
enum TxSmsStatus { PENDING QUEUED SENT DELIVERED UNDELIVERED FAILED }  // prog sms-message.aggregate.ts:28

// OutboundMessage additions (one ledger, kind-tagged — do NOT create a parallel table)
// kind     MessageKind  @default(MARKETING)
// txStatus TxSmsStatus?                 // transactional rows; marketing keeps BlastRecipientStatus
// purpose  String?                      // "verification_code" | "2fa" | "payment_receipt"
// blastId/recipientId are NULL for transactional rows
// @@index([organizationId, kind, sentAt])

model MessageTemplate {                  // transactional bodies, tenant-scoped
  id        String      @id @default(cuid())
  tenantId  String
  key       String                       // "verification_code", "magic_link" ...
  channel   MessageChannel
  kind      MessageKind  @default(TRANSACTIONAL)
  body      String       @db.Text
  isActive  Boolean      @default(true)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  @@unique([tenantId, key])
  @@schema("messaging")
}
```

**Why one ledger, not a parallel `TransactionalMessage` table:** a separate table fragments the outbound ledger and breaks the inbox/analytics joins already hung off `OutboundMessage` (`blasts.service.ts` status-callback + analytics). One table, `kind`-tagged, keeps every consumer working.

## Send path – `TwilioService.sendTransactional`

Add a **second** public method on the existing `apps/api/src/twilio/twilio.service.ts`; do not touch `sendMessage`.

- **Separate sender:** `TWILIO_TRANSACTIONAL_FROM` / `TWILIO_TRANSACTIONAL_MESSAGING_SERVICE_SID` (fallback `TWILIO_PHONE_NUMBER`). A distinct sender separates carrier reputation and lets carriers classify it correctly.
- Reuses the existing rate-limiter/permit machinery (`acquireSendPermit`) and `withRetry`.
- Status callback → same `/twilio-status-callback`; resolution to `OutboundMessage` by `twilioMessageSid` regardless of kind.

## `TransactionalMessagingService`

`apps/api/src/messaging/transactional-messaging.service.ts` (beside `ConsentService`):

1. **No** consent / compliance / suppression. Documented invariant – the service never imports or calls those gates.
2. Resolve body: `templateKey → MessageTemplate.body` rendered via the existing `TemplateRendererService`, else raw body.
3. Create `OutboundMessage { kind: TRANSACTIONAL, txStatus: PENDING, purpose, blastId: null }` + outbox `tx-sms.requested` (one `$transaction`).
4. `assertValidTxSmsTransition(PENDING, QUEUED)`; update; `twilio.sendTransactional`.
5. Success → `SENT` + `twilioMessageSid` + outbox `tx-sms.sent`. Failure → `FAILED` + outbox `tx-sms.failed`. No retry-suppression – codes are time-boxed.

FSM `PENDING→QUEUED→SENT→DELIVERED|UNDELIVERED|FAILED` lives in `tx-sms-state.machine.ts`, copied from prog's `sms-message.aggregate.ts` transition map (doc 12 pattern).

## Cross-domain seam – `TRANSACTIONAL_DISPATCHER`

prog's `InProcessCrossDomainDispatcher.sendSms` becomes a Nest provider token:

```ts
// apps/api/src/messaging/transactional-dispatcher.ts
export const TRANSACTIONAL_DISPATCHER = Symbol('TransactionalDispatcher');
export interface TransactionalDispatcher {
  sendSms(input:   { tenantId; toPhone; body?; templateKey?; vars?; purpose }): Promise<void>;
  sendEmail(input: { tenantId; toAddress; templateKey; vars; purpose }): Promise<void>;
}
```

`MessagingModule` binds `TRANSACTIONAL_DISPATCHER → TransactionalMessagingService`. The IAM mobile-verification handler (doc 04) injects the token and calls `sendSms({ templateKey: 'verification_code', vars: { code }, purpose: 'verification_code' })`. Email verification / magic-link / payment receipts use `sendEmail` (doc 07). Direct analogue of prog's `CROSS_DOMAIN_DISPATCHER`, minus the bus.

## Status-callback ownership

Extract `OutboundMessageService` from the `OutboundMessage` half of `blasts.service.ts handleTwilioStatusCallback`. The webhook controller calls both `blasts.handleTwilioStatusCallback` (recipient rows) and `outboundMessages.handleStatusCallback` (outbound rows, marketing + transactional). For transactional rows, map Twilio status → `TxSmsStatus` via `assertValidTxSmsTransition`, swallowing already-terminal transitions.

## Analytics separation

- `OutboundMessage.kind` is the split key; add it to `AnalyticsService` group-bys. Report marketing deliverability vs transactional delivery-success separately.
- `AnalyticsSnapshot.metricName` namespacing: `tx.sms.sent|delivered|failed` vs existing `sent`/`failed` (marketing). Tx snapshots carry `blastId: null`, `labels: { kind, purpose }`.
- Compliance/opt-out reporting reads **only** `kind = MARKETING`.

## Verification – priority invariants

- A STOP'd + suppressed contact **still** receives a transactional SMS.
- `ConsentService` and `ComplianceService` are **never** invoked on the transactional path (assert with spies).
- Quiet-hours / missing footer does **not** block a transactional send.
- The transactional sender env (`TWILIO_TRANSACTIONAL_FROM`) is used, not the marketing number.
- Analytics `kind` split excludes transactional from marketing deliverability.

## Files

- `packages/db/prisma/schema.prisma` – `MessageKind`, `TxSmsStatus`, `OutboundMessage` additions, `MessageTemplate`.
- `apps/api/src/twilio/twilio.service.ts` – add `sendTransactional`.
- `apps/api/src/messaging/transactional-messaging.service.ts`, `transactional-dispatcher.ts`, `tx-sms-state.machine.ts` – new.
- `apps/api/src/messaging/outbound-message.service.ts` – extracted status-callback owner.
- `apps/api/src/analytics/analytics.service.ts` – `kind` split.
