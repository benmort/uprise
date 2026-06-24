-- Feature-flag overrides (tenant-scoped + global). Additive.

CREATE TABLE "tenant"."FeatureFlagOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "flagKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeatureFlagOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeatureFlagOverride_tenantId_flagKey_idx" ON "tenant"."FeatureFlagOverride" ("tenantId", "flagKey");

-- One override per (tenant, flag); one global override per flag. Partial unique
-- indexes because a plain UNIQUE(tenantId, flagKey) treats NULL tenantIds as
-- distinct and would allow duplicate global rows.
CREATE UNIQUE INDEX "FeatureFlagOverride_tenant_flag_uq"
    ON "tenant"."FeatureFlagOverride" ("tenantId", "flagKey") WHERE "tenantId" IS NOT NULL;
CREATE UNIQUE INDEX "FeatureFlagOverride_global_flag_uq"
    ON "tenant"."FeatureFlagOverride" ("flagKey") WHERE "tenantId" IS NULL;

ALTER TABLE "tenant"."FeatureFlagOverride"
    ADD CONSTRAINT "FeatureFlagOverride_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
