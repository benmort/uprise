-- Add a network-scoped override layer to FeatureFlagOverride. Scope is now exactly
-- one of: tenant (tenantId set), network (networkId set, id-only ref), or global
-- (both null). Additive; applied with `prisma migrate deploy`.

ALTER TABLE "tenant"."FeatureFlagOverride" ADD COLUMN "networkId" TEXT;

-- The old global partial-unique keyed on (flagKey) WHERE tenantId IS NULL would now
-- wrongly cover network rows (tenantId null, networkId set) — two networks' rows for
-- the same flag would both have tenantId null and collide. Recreate it to require
-- BOTH ids null (a true platform-wide global row).
DROP INDEX IF EXISTS "tenant"."FeatureFlagOverride_global_flag_uq";
CREATE UNIQUE INDEX "FeatureFlagOverride_global_flag_uq"
    ON "tenant"."FeatureFlagOverride" ("flagKey")
    WHERE "tenantId" IS NULL AND "networkId" IS NULL;

-- One override per (network, flag).
CREATE UNIQUE INDEX "FeatureFlagOverride_network_flag_uq"
    ON "tenant"."FeatureFlagOverride" ("networkId", "flagKey")
    WHERE "networkId" IS NOT NULL;

-- Query index for the network layer.
CREATE INDEX "FeatureFlagOverride_networkId_flagKey_idx"
    ON "tenant"."FeatureFlagOverride" ("networkId", "flagKey");
