-- Durable error history for the API and the worker.
--
-- Additive only: one new table in the existing "ops" schema, no changes to anything already there.
-- Applied with `prisma migrate deploy` (never `migrate dev`, which drops the raw partial-unique
-- indexes this database relies on elsewhere).

CREATE TABLE IF NOT EXISTS "ops"."LogEvent" (
    "id"       TEXT NOT NULL,
    "at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "service"  TEXT NOT NULL,
    "domain"   TEXT NOT NULL,
    "level"    TEXT NOT NULL,
    "message"  TEXT NOT NULL,
    "context"  JSONB,
    "trace"    TEXT,
    "tenantId" TEXT,

    CONSTRAINT "LogEvent_pkey" PRIMARY KEY ("id")
);

-- "recent errors", "recent errors in this domain", and the age-based retention sweep.
CREATE INDEX IF NOT EXISTS "LogEvent_at_idx" ON "ops"."LogEvent"("at");
CREATE INDEX IF NOT EXISTS "LogEvent_domain_at_idx" ON "ops"."LogEvent"("domain", "at");
CREATE INDEX IF NOT EXISTS "LogEvent_level_at_idx" ON "ops"."LogEvent"("level", "at");
