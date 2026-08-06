-- The CRM write-back's transparency spine. One row per (connection, domain event): what
-- uprise tried to push to the CRM, what happened, and why — the delivery LEDGER. BullMQ
-- is only the scheduler; a sweep re-enqueues any PENDING row a swallowed reaction error
-- stranded, and the (connectionId, eventId) unique is the at-most-once floor under
-- at-least-once event delivery + retries.
CREATE TYPE integration."IntegrationPushStatus" AS ENUM (
  'PENDING',    -- recorded by the reaction, awaiting the worker
  'SENDING',    -- claimed by an attempt
  'SUCCEEDED',
  'SKIPPED',    -- deliberately not sent (stream off, no identity, consent gate, cancelled)
  'FAILED',     -- unrecoverable or attempts exhausted
  'HELD'        -- parked while the connection is not ACTIVE (circuit breaker)
);

-- Circuit-breaker state for a connection whose credential stopped working: not the user's
-- deliberate INACTIVE (disconnect), and not deletable — "fix me, then everything resumes".
ALTER TYPE integration."IntegrationConnectionStatus" ADD VALUE IF NOT EXISTS 'NEEDS_ATTENTION';

CREATE TABLE integration."IntegrationPushDelivery" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "stream" TEXT NOT NULL,
  "contactId" TEXT,
  "externalPersonId" TEXT,
  "status" integration."IntegrationPushStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "requestSummary" JSONB,
  "responseSummary" JSONB,
  "skipReason" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "IntegrationPushDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationPushDelivery_connectionId_fkey" FOREIGN KEY ("connectionId")
    REFERENCES integration."IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- At-most-once per (connection, event) — the push pipeline's core invariant.
CREATE UNIQUE INDEX "IntegrationPushDelivery_connectionId_eventId_key"
  ON integration."IntegrationPushDelivery"("connectionId", "eventId");
-- The delivery-log UI's filters (per-tenant, by status, newest first).
CREATE INDEX "IntegrationPushDelivery_tenantId_status_createdAt_idx"
  ON integration."IntegrationPushDelivery"("tenantId", "status", "createdAt");
-- Per-contact history on the contact timeline.
CREATE INDEX "IntegrationPushDelivery_tenantId_contactId_createdAt_idx"
  ON integration."IntegrationPushDelivery"("tenantId", "contactId", "createdAt");
-- The sweep (stale PENDING/SENDING) + retention prune walk this.
CREATE INDEX "IntegrationPushDelivery_status_updatedAt_idx"
  ON integration."IntegrationPushDelivery"("status", "updatedAt");
