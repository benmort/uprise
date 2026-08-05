-- Action Network issues one API key per group, so a tenant administering several groups
-- needs one connection per group. externalGroup joins the upsert key; '' (never NULL —
-- NULLs are distinct in a unique index) preserves one-per-type for INTERNAL/legacy rows.
ALTER TABLE integration."IntegrationConnection"
  ADD COLUMN IF NOT EXISTS "externalGroup" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS integration."IntegrationConnection_tenantId_type_key";

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationConnection_tenantId_type_externalGroup_key"
  ON integration."IntegrationConnection"("tenantId", "type", "externalGroup");
