-- Transactional calls listing sorts by createdAt desc within a tenant
-- (GET /calls). Add the composite index so the list + pagination stay indexed.
CREATE INDEX IF NOT EXISTS "Call_tenantId_createdAt_idx"
  ON "telephony"."Call" ("tenantId", "createdAt");
