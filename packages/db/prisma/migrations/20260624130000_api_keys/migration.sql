-- API keys domain (tenant-scoped). Additive.

CREATE TABLE "tenant"."ApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiKey_tenantId_revokedAt_idx" ON "tenant"."ApiKey" ("tenantId", "revokedAt");

ALTER TABLE "tenant"."ApiKey"
    ADD CONSTRAINT "ApiKey_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
