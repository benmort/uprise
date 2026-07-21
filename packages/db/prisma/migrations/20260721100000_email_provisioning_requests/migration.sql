-- Tenant-owner email setup requests (provisioning stays super-admin-executed).
CREATE TYPE "email"."EmailProvisioningRequestStatus" AS ENUM ('OPEN', 'FULFILLED', 'DECLINED', 'WITHDRAWN');

CREATE TABLE "email"."EmailProvisioningRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "email"."EmailProvisioningRequestStatus" NOT NULL DEFAULT 'OPEN',
    "kind" "email"."EmailIdentityKind",
    "domain" TEXT,
    "notes" TEXT,
    "requestedById" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionReason" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailProvisioningRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailProvisioningRequest_status_createdAt_idx"
  ON "email"."EmailProvisioningRequest"("status", "createdAt");
CREATE INDEX "EmailProvisioningRequest_tenantId_status_idx"
  ON "email"."EmailProvisioningRequest"("tenantId", "status");

-- Idempotency backstop: one OPEN request per tenant. Hand-maintained partial unique —
-- `prisma migrate dev` would drop it; this repo applies migrations with `migrate deploy` only.
CREATE UNIQUE INDEX "EmailProvisioningRequest_one_open_per_tenant"
  ON "email"."EmailProvisioningRequest"("tenantId")
  WHERE "status" = 'OPEN';
