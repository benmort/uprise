-- Per-tenant Twilio accounts + AU number provisioning (telephony schema).
-- Additive only; applied with `prisma migrate deploy`.

CREATE TYPE "telephony"."TelephonyAccountMode" AS ENUM ('SUBACCOUNT', 'BYO', 'PLATFORM');

CREATE TYPE "telephony"."TelephonyAccountStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'CLOSED');

CREATE TYPE "telephony"."TelephonyNumberStatus" AS ENUM ('PENDING', 'ACTIVE', 'RELEASED');

CREATE TYPE "telephony"."TelephonyProvisioningStatus" AS ENUM (
  'REQUESTED',
  'SUBACCOUNT_CREATED',
  'COMPLIANCE_DRAFT',
  'COMPLIANCE_SUBMITTED',
  'COMPLIANCE_APPROVED',
  'COMPLIANCE_REJECTED',
  'NUMBER_PURCHASED',
  'WEBHOOKS_CONFIGURED',
  'ACTIVE',
  'FAILED'
);

CREATE TYPE "telephony"."TelephonyStepStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'SKIPPED');

CREATE TABLE "telephony"."TelephonyAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mode" "telephony"."TelephonyAccountMode" NOT NULL,
    "status" "telephony"."TelephonyAccountStatus" NOT NULL DEFAULT 'PROVISIONING',
    "accountSid" TEXT NOT NULL,
    "encryptedAuthToken" TEXT NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelephonyAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelephonyAccount_accountSid_key" ON "telephony"."TelephonyAccount"("accountSid");

CREATE INDEX "TelephonyAccount_tenantId_status_idx" ON "telephony"."TelephonyAccount"("tenantId", "status");

CREATE TABLE "telephony"."TelephonyPhoneNumber" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "campaignId" TEXT,
    "phoneNumberE164" TEXT NOT NULL,
    "phoneNumberSid" TEXT NOT NULL,
    "bundleSid" TEXT,
    "addressSid" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'marketing',
    "status" "telephony"."TelephonyNumberStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelephonyPhoneNumber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelephonyPhoneNumber_phoneNumberE164_key" ON "telephony"."TelephonyPhoneNumber"("phoneNumberE164");

CREATE UNIQUE INDEX "TelephonyPhoneNumber_phoneNumberSid_key" ON "telephony"."TelephonyPhoneNumber"("phoneNumberSid");

CREATE INDEX "TelephonyPhoneNumber_tenantId_campaignId_status_idx" ON "telephony"."TelephonyPhoneNumber"("tenantId", "campaignId", "status");

CREATE TABLE "telephony"."TelephonyProvisioningRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "accountId" TEXT,
    "status" "telephony"."TelephonyProvisioningStatus" NOT NULL DEFAULT 'REQUESTED',
    "resumeStatus" "telephony"."TelephonyProvisioningStatus",
    "complianceInput" JSONB NOT NULL,
    "documents" JSONB,
    "bundleSid" TEXT,
    "addressSid" TEXT,
    "endUserSid" TEXT,
    "phoneNumberId" TEXT,
    "lastError" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelephonyProvisioningRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelephonyProvisioningRun_bundleSid_key" ON "telephony"."TelephonyProvisioningRun"("bundleSid");

CREATE INDEX "TelephonyProvisioningRun_tenantId_status_idx" ON "telephony"."TelephonyProvisioningRun"("tenantId", "status");

CREATE TABLE "telephony"."TelephonyProvisioningStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" "telephony"."TelephonyStepStatus" NOT NULL,
    "detail" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelephonyProvisioningStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelephonyProvisioningStep_runId_createdAt_idx" ON "telephony"."TelephonyProvisioningStep"("runId", "createdAt");

CREATE INDEX "TelephonyProvisioningStep_tenantId_createdAt_idx" ON "telephony"."TelephonyProvisioningStep"("tenantId", "createdAt");

ALTER TABLE "telephony"."TelephonyProvisioningStep" ADD CONSTRAINT "TelephonyProvisioningStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "telephony"."TelephonyProvisioningRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
