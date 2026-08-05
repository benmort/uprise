-- Durable error capture (additive; applied with `prisma migrate deploy`).
--
-- Vercel retains no runtime logs on this account (Pro, no Observability add-on, no log
-- drains): `vercel logs` tails from now for five minutes and stores nothing. A production
-- 5xx is therefore unrecoverable minutes after it happens — diagnosing one currently means
-- reconstructing it from row state. This table is the retention.
--
-- Written best-effort by the API's global exception filter and by the Next apps' error
-- boundaries, so it must never constrain the write: every column but `message` is nullable
-- and there are no foreign keys (tenantId/userId are id-only, matching the cross-schema rule).

CREATE TABLE IF NOT EXISTS "ops"."ErrorLog" (
    "id"         TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source"     TEXT NOT NULL,
    "method"     TEXT,
    "path"       TEXT,
    "statusCode" INTEGER,
    "name"       TEXT,
    "message"    TEXT NOT NULL,
    "stack"      TEXT,
    "requestId"  TEXT,
    "tenantId"   TEXT,
    "userId"     TEXT,
    "context"    JSONB,
    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- Newest-first sweeps ("what broke in the last hour?") and the two narrowing cuts:
-- by app, and by tenant when a specific organisation reports a problem.
CREATE INDEX IF NOT EXISTS "ErrorLog_occurredAt_idx" ON "ops"."ErrorLog" ("occurredAt");
CREATE INDEX IF NOT EXISTS "ErrorLog_source_occurredAt_idx" ON "ops"."ErrorLog" ("source", "occurredAt");
CREATE INDEX IF NOT EXISTS "ErrorLog_tenantId_occurredAt_idx" ON "ops"."ErrorLog" ("tenantId", "occurredAt");
