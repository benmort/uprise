-- Self-signup → admin-approval: prospect-initiated request to join an existing tenant
-- (the inverse of TenantInvitation). Additive; hand-written (migrate deploy).

CREATE TABLE "tenant"."TenantJoinRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "requestedRole" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantJoinRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantJoinRequest_tenantId_userId_key" ON "tenant"."TenantJoinRequest"("tenantId", "userId");

CREATE INDEX "TenantJoinRequest_tenantId_status_idx" ON "tenant"."TenantJoinRequest"("tenantId", "status");

ALTER TABLE "tenant"."TenantJoinRequest" ADD CONSTRAINT "TenantJoinRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
