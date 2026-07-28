-- Integration tenant isolation.
--
-- Background: IntegrationsService.ensureConnection() used to lazily CREATE an
-- IntegrationConnection for any tenant, seeded from the process-wide
-- ACTION_NETWORK_API_KEY. Every tenant therefore reached the same external
-- account. The service change removes that fallback; this migration closes the
-- three schema-level holes that let it happen quietly.

-- 1. Audience records which connection produced it, so a re-sync resolves the
--    same credential (and, once network sharing lands, so provenance survives
--    when the connection belongs to another tenant). id-only ref across the
--    audience → integration schema boundary; no FK, per the house rule.
ALTER TABLE "audience"."Audience" ADD COLUMN IF NOT EXISTS "integrationConnectionId" TEXT;

CREATE INDEX IF NOT EXISTS "Audience_integrationConnectionId_idx"
  ON "audience"."Audience" ("integrationConnectionId");

-- 2. One connection per (tenant, type). The service already assumed this but
--    enforced it with a racy findFirst-inside-upsert, so concurrent writes could
--    leave duplicates behind. Dedupe before adding the constraint: keep the most
--    recently updated row per pair, repoint its siblings' sync jobs onto it, then
--    delete the losers. Repointing FIRST is what preserves sync history —
--    IntegrationSyncJob cascades on connection delete.
WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "tenantId", "type"
      ORDER BY ("status" = 'ACTIVE') DESC, "updatedAt" DESC, "id" DESC
    ) AS "keepId"
  FROM "integration"."IntegrationConnection"
)
UPDATE "integration"."IntegrationSyncJob" AS j
SET "integrationConnectionId" = r."keepId"
FROM ranked r
WHERE j."integrationConnectionId" = r."id"
  AND r."id" <> r."keepId";

WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "tenantId", "type"
      ORDER BY ("status" = 'ACTIVE') DESC, "updatedAt" DESC, "id" DESC
    ) AS "keepId"
  FROM "integration"."IntegrationConnection"
)
DELETE FROM "integration"."IntegrationConnection" AS c
USING ranked r
WHERE c."id" = r."id"
  AND r."id" <> r."keepId";

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationConnection_tenantId_type_key"
  ON "integration"."IntegrationConnection" ("tenantId", "type");

-- 3. ContactSourceRecord was uniquely keyed (sourceSystem, externalId) — across
--    ALL tenants. Two tenants syncing the same Action Network person collided.
--    Deliberately non-additive: widening a unique constraint can never fail on
--    existing rows (every (sourceSystem, externalId) pair was already unique, so
--    it stays unique with tenantId prepended), and leaving it is an active
--    cross-tenant defect.
DROP INDEX IF EXISTS "audience"."ContactSourceRecord_sourceSystem_externalId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "ContactSourceRecord_tenantId_sourceSystem_externalId_key"
  ON "audience"."ContactSourceRecord" ("tenantId", "sourceSystem", "externalId");
