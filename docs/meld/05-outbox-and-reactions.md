# 05 – Outbox & Reactions Backbone

Foundation step 6. The hybrid choreography layer: Prisma rows stay the source of truth; a transactional outbox emits domain events; in-process reactions consume them. Transport is BullMQ (uprise already depends on it).

Source patterns (prog, re-expressed on Prisma + BullMQ): `apps/platform/src/shared/outbox/outbox-relay.ts`, `apps/platform/src/reactions/{reaction.registry,reaction.consumer,reaction.types}.ts`, `packages/event-based-service-client/src/event-types.ts`.

## Models (`events` schema)

```prisma
model OutboxEvent {
  id          String    @id @default(cuid())
  seq         BigInt    @default(autoincrement())   // FIFO + relay cursor
  tenantId    String
  eventType   String                                 // a @uprise/events key
  aggregateId String                                 // the row this is about
  payload     Json
  metadata    Json                                   // correlationId, causationId, actorId
  occurredAt  DateTime  @default(now())
  publishedAt DateTime?                              // NULL = unpublished
  attempts    Int       @default(0)
  @@index([publishedAt, seq])
  @@index([tenantId, eventType])
  @@schema("events")
}

model ReactionDedup {
  id         String   @id @default(cuid())
  source     String                                 // queue / consumer name
  eventId    String                                 // outbox event id
  receivedAt DateTime @default(now())
  @@unique([source, eventId])
  @@schema("events")
}
```

## Transactional append

`apps/api/src/common/outbox/outbox.service.ts` exposes `append(tx, evt)` = `tx.outboxEvent.create(...)`. Domain services wrap the state write and the outbox insert in one `prisma.$transaction`, so atomicity is free:

```ts
await this.prisma.$transaction(async (tx) => {
  const audience = await tx.audience.update({ where, data });
  await this.outbox.append(tx, {
    tenantId, eventType: 'audience.imported',
    aggregateId: audience.id, payload, metadata,
  });
});
```

This is the single contract every domain port relies on (FSM transition → row update + outbox event in one tx).

## Relay (BullMQ repeatable job in `apps/worker`)

A repeatable job (~500ms–1s) drains unpublished rows and enqueues them onto the `domain-events` queue:

```ts
await prisma.$transaction(async (tx) => {
  const rows = await tx.$queryRaw`
    SELECT * FROM "events"."OutboxEvent"
    WHERE "publishedAt" IS NULL ORDER BY "seq" ASC LIMIT 100
    FOR UPDATE SKIP LOCKED`;          // raw SQL: Prisma has no locking clause
  for (const row of rows) {
    await domainEventsQueue.enqueue(row, { jobId: row.id });  // jobId = first-layer dedup
    await tx.outboxEvent.update({
      where: { id: row.id },
      data: { publishedAt: new Date(), attempts: { increment: 1 } },
    });
  }
});
```

`FOR UPDATE SKIP LOCKED` makes the relay single-writer-safe even if accidentally double-run. Mirrors prog's `drainOnce`.

## Transport decision: BullMQ, not Redis Streams

prog uses Redis Streams to fan one event out to N consumer groups across many services. uprise has exactly one consumer (the in-process reaction registry) and already depends on BullMQ with a configured connection (`QueueConfigService`, `apps/api/src/common/queue/bullmq-dispatch.queue.ts`). BullMQ gives retries, backoff, jobId dedup, and the existing `QueueStatsService` observability for free. Redis Streams would add `XGROUP`/`XACK`/cursor machinery for zero benefit at one consumer.

- Extend `DispatchQueueName` in `apps/api/src/common/queue/dispatch-queue.ts` + `QUEUE_NAMES`/`QUEUE_JOB_TYPES` in `queue.constants.ts` with `domain-events`.
- Add a `domain-events` worker in `apps/worker/src/main.ts` (alongside the existing five).
- `ReactionDedup` is the second-layer idempotency guard (jobId is the first).

## Reaction registry (NestJS)

Port prog's `Reaction` interface + registry, Nest-native and BullMQ-fed:

- `@uprise/events` exports `interface Reaction { trigger: string; emits: string[]; handle(evt): Promise<void> }` and the loop-safety contract `emits ∩ triggers = ∅`.
- `ReactionsModule` (`apps/api/src/common/reactions/`) collects all `@Injectable()` reactions, builds `Map<eventType, Reaction>` at boot, and runs prog's `loopUnsafeTriggers` fail-fast check.
- The `domain-events` worker resolves `ReactionRegistry` from the Nest application context (as prog's `main.reactions.ts` does), looks up the event, claims `ReactionDedup`, runs `handle`, and catches-and-logs so a side-effect failure never poisons the queue.

## `@uprise/events` catalogue

```ts
export const EVENT_TYPES = {
  AUDIENCE_IMPORTED: 'audience.imported',
  BLAST_SENT: 'blast.sent',
  USER_CREATED: 'iam.user.created',
  TENANT_INVITATION_SENT: 'tenant.invitation.sent',
  TX_SMS_REQUESTED: 'tx-sms.requested',
  EMAIL_QUEUED: 'email.queued',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  // ...
} as const;

export interface DomainEventMap {
  'audience.imported': { audienceId: string; tenantId: string; count: number };
  'iam.user.created':  { userId: string; email: string; tenantId: string };
  // ...
}
```

Naming convention: `<domain>.<thing>.<pastTenseVerb>`, dot-separated, aligned with the schema namespaces (doc 02). The outbox `append` and every reaction `handle` are generic over this map.

## Realtime (SSE)

`RealtimeEventsService` (`apps/api/src/common/events/realtime-events.service.ts`) is an in-process RxJS Subject feeding SSE – node-local, so reactions running in the worker can't reach the api's Subject. **Keep it unchanged in the foundation.** Add one reaction in the api process that emits UI-facing events to it; defer any cross-process SSE bridge.

## Verification

- integration: a service write commits row + `OutboxEvent` atomically (assert both present after one `$transaction`); relay publishes; a test reaction fires exactly once; replaying the same outbox id is blocked by `ReactionDedup`.
- unit: registry boot fails fast if a reaction's `emits ∩ trigger` overlaps.

## Files

- `packages/db/prisma/schema.prisma` – `OutboxEvent`, `ReactionDedup`.
- `apps/api/src/common/outbox/outbox.service.ts`, `outbox.module.ts` – new.
- `apps/api/src/common/reactions/{reactions.module,reaction.registry}.ts` – new.
- `apps/api/src/common/queue/dispatch-queue.ts`, `queue.constants.ts` – add `domain-events`.
- `apps/worker/src/main.ts` – add `outbox-relay` repeatable job + `domain-events` consumer.
- `packages/events/**` – event catalogue + `Reaction` interface.
