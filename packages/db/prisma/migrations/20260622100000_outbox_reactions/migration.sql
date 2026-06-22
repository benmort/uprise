-- Outbox + reactions backbone (meld doc 05). Additive: a new `events` schema
-- with the OutboxEvent ledger + ReactionDedup idempotency table.
CREATE SCHEMA IF NOT EXISTS "events";

CREATE TABLE "events"."OutboxEvent" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OutboxEvent_publishedAt_seq_idx" ON "events"."OutboxEvent" ("publishedAt", "seq");
CREATE INDEX "OutboxEvent_tenantId_eventType_idx" ON "events"."OutboxEvent" ("tenantId", "eventType");

CREATE TABLE "events"."ReactionDedup" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReactionDedup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReactionDedup_source_eventId_key" ON "events"."ReactionDedup" ("source", "eventId");
