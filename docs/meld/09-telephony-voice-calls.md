# 09 – Telephony: Voice Calls (net-new)

M4. Voice calling is net-new to yarns (yarns is SMS/WhatsApp only). SMS is already canonical in yarns (`Blast`/`OutboundMessage`), and transactional SMS is doc 06 – this doc covers **voice calls only**.

Source: `/Users/benjaminmort/code/prog/core-orchestration/apps/platform/src/services/telephony/{domain/call.aggregate.ts,process-twilio-webhook.handler.ts,twilio.adapter.ts}`.

## Model (`telephony` schema)

```prisma
enum CallStatus { INITIATED RINGING IN_PROGRESS COMPLETED BUSY NO_ANSWER FAILED }  // call.aggregate.ts:31

model Call {
  id              String     @id @default(cuid())
  tenantId        String
  contactId       String?                            // id-only ref to public.Contact
  toNumber        String
  fromNumber      String
  status          CallStatus @default(INITIATED)
  providerCallId  String?    @unique
  durationSeconds Int?
  recordingUrl    String?
  priceCents      Int?
  currency        String?
  startedAt       DateTime?
  endedAt         DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  @@index([tenantId, status])
  @@schema("telephony")
}
```

## Module

`apps/api/src/calls/`:

- `calls.service.ts` – `initiate()` writes `INITIATED` + outbox `call.initiated`, then calls `TwilioService.placeCall`.
- `call-state.machine.ts` – `CallStatus` FSM (`INITIATED→RINGING→IN_PROGRESS→COMPLETED|BUSY|NO_ANSWER|FAILED`), copied from prog's transition map.
- `calls.controller.ts` – initiate + read call log.

Extend `apps/api/src/twilio/twilio.service.ts` with `placeCall` = `client.calls.create({ to, from, url|twiml, statusCallback })`. Reuse the existing config/retry/permit machinery.

## Webhook – `/voice-status-callback`

Port `driveCall` from `process-twilio-webhook.handler.ts`:

- `claim(provider='twilio', eventId=CallSid)` (doc 12).
- Map Twilio CallStatus (`ringing`/`in-progress`/`completed`/`busy`/`no-answer`/`failed`/`canceled`) → `Call` FSM, binding `durationSeconds`, `recordingUrl`, `priceCents`/`currency`, `startedAt`/`endedAt`.

## Worker queue

`voice-dispatch` only if bulk/scheduled calling is needed – not in the initial port.

## Verification

- FSM unit tests.
- Webhook idempotency: claim-once; replayed-terminal swallowed; duration/recording/price bound correctly on `completed`.
- e2e: initiate (Noop double) → `voice-status-callback` sequence → `COMPLETED`.

## Files

- `packages/db/prisma/schema.prisma` – `CallStatus`, `Call`.
- `apps/api/src/calls/**` – new module.
- `apps/api/src/twilio/twilio.service.ts` – add `placeCall`.
- `apps/api/src/webhooks/webhooks.controller.ts` – add `/voice-status-callback`.
