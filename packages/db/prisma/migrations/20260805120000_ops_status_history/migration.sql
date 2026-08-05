-- Status history for the public status page (additive; applied with `prisma migrate deploy`).
--
-- The page reported a live snapshot and nothing else: refresh it and the previous answer was
-- gone. These two tables are its memory — enough to say "99.8% over 90 days" and "here is what
-- broke last month", which is the difference between a health check with a nice layout and a
-- status page.
--
-- Only the PUBLIC rollup is stored: named services and one word each. No sha, no origin, no
-- provider state — the same discipline the public payload already follows, so the history can
-- never leak what the live view withholds.

CREATE TABLE IF NOT EXISTS "ops"."StatusCheck" (
    "id"       TEXT NOT NULL,
    "at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok"       BOOLEAN NOT NULL,
    "services" JSONB NOT NULL,
    CONSTRAINT "StatusCheck_pkey" PRIMARY KEY ("id")
);

-- Every read is a time window ("the last 90 days", "today"), newest-first.
CREATE INDEX IF NOT EXISTS "StatusCheck_at_idx" ON "ops"."StatusCheck"("at");

CREATE TABLE IF NOT EXISTS "ops"."StatusIncident" (
    "id"          TEXT NOT NULL,
    "serviceKey"  TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "status"      TEXT NOT NULL,
    "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"  TIMESTAMP(3),
    CONSTRAINT "StatusIncident_pkey" PRIMARY KEY ("id")
);

-- "What has been wrong with this service?" and the page's own "recent incidents" list.
CREATE INDEX IF NOT EXISTS "StatusIncident_serviceKey_startedAt_idx"
    ON "ops"."StatusIncident"("serviceKey", "startedAt");
CREATE INDEX IF NOT EXISTS "StatusIncident_startedAt_idx"
    ON "ops"."StatusIncident"("startedAt");

-- At most one OPEN incident per service. Without this a flapping check would open a fresh
-- incident every five minutes and the history would read as hundreds of outages rather than one.
-- Partial unique indexes are invisible to Prisma's schema diff, which is why this schema is
-- applied with `migrate deploy` — `migrate dev` would drop it on the next generate.
CREATE UNIQUE INDEX IF NOT EXISTS "StatusIncident_one_open_per_service"
    ON "ops"."StatusIncident"("serviceKey") WHERE "resolvedAt" IS NULL;
