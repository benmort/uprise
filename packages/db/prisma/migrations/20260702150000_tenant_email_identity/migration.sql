-- Per-tenant SendGrid email identities (email schema).
-- Additive only; applied with `prisma migrate deploy`.

CREATE TYPE "email"."EmailAccountMode" AS ENUM ('SUBUSER', 'BYO', 'PLATFORM');

CREATE TYPE "email"."EmailAccountStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'CLOSED');

CREATE TYPE "email"."EmailIdentityKind" AS ENUM ('UPRISE_SUBDOMAIN', 'CUSTOM_DOMAIN', 'SINGLE_ADDRESS');

CREATE TYPE "email"."EmailIdentityStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

CREATE TYPE "email"."EmailProvisioningStatus" AS ENUM (
  'REQUESTED',
  'SUBUSER_CREATED',
  'DOMAIN_AUTH_CREATED',
  'DNS_CONFIGURED',
  'VALIDATION_FAILED',
  'DOMAIN_VERIFIED',
  'WEBHOOKS_CONFIGURED',
  'ACTIVE',
  'FAILED'
);

CREATE TYPE "email"."EmailStepStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- Sender provenance on the ledger (null = platform env sender).
ALTER TABLE "email"."Email" ADD COLUMN "emailAccountId" TEXT;
ALTER TABLE "email"."Email" ADD COLUMN "senderIdentityId" TEXT;
ALTER TABLE "email"."Email" ADD COLUMN "fromEmail" TEXT;

CREATE TABLE "email"."EmailAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mode" "email"."EmailAccountMode" NOT NULL,
    "status" "email"."EmailAccountStatus" NOT NULL DEFAULT 'PROVISIONING',
    "subuserUsername" TEXT,
    "encryptedApiKey" TEXT NOT NULL,
    "webhookPublicKey" TEXT,
    "friendlyName" TEXT NOT NULL,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailAccount_subuserUsername_key" ON "email"."EmailAccount"("subuserUsername");

CREATE INDEX "EmailAccount_tenantId_status_idx" ON "email"."EmailAccount"("tenantId", "status");

CREATE TABLE "email"."EmailSenderIdentity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "campaignId" TEXT,
    "kind" "email"."EmailIdentityKind" NOT NULL,
    "domain" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "sendgridDomainId" TEXT,
    "dnsRecords" JSONB,
    "purpose" TEXT NOT NULL DEFAULT 'marketing',
    "status" "email"."EmailIdentityStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSenderIdentity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailSenderIdentity_tenantId_campaignId_status_idx" ON "email"."EmailSenderIdentity"("tenantId", "campaignId", "status");

CREATE TABLE "email"."EmailProvisioningRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "accountId" TEXT,
    "identityId" TEXT,
    "status" "email"."EmailProvisioningStatus" NOT NULL DEFAULT 'REQUESTED',
    "resumeStatus" "email"."EmailProvisioningStatus",
    "input" JSONB NOT NULL,
    "sendgridDomainId" TEXT,
    "dnsimpleRecordIds" JSONB,
    "lastError" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailProvisioningRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailProvisioningRun_tenantId_status_idx" ON "email"."EmailProvisioningRun"("tenantId", "status");

CREATE TABLE "email"."EmailProvisioningStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" "email"."EmailStepStatus" NOT NULL,
    "detail" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailProvisioningStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailProvisioningStep_runId_createdAt_idx" ON "email"."EmailProvisioningStep"("runId", "createdAt");

CREATE INDEX "EmailProvisioningStep_tenantId_createdAt_idx" ON "email"."EmailProvisioningStep"("tenantId", "createdAt");

ALTER TABLE "email"."EmailProvisioningStep" ADD CONSTRAINT "EmailProvisioningStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "email"."EmailProvisioningRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
