-- Email domain + provider-webhook dedup (meld docs 07 + 12). Additive.
CREATE SCHEMA IF NOT EXISTS "email";
CREATE SCHEMA IF NOT EXISTS "ops";

CREATE TYPE "email"."EmailStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED');

CREATE TABLE "email"."Email" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "email"."EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "templateKey" TEXT,
    "purpose" TEXT,
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bounceReason" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Email_tenantId_status_idx" ON "email"."Email" ("tenantId", "status");
CREATE INDEX "Email_providerMessageId_idx" ON "email"."Email" ("providerMessageId");

CREATE TABLE "email"."EmailTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailTemplate_tenantId_key_key" ON "email"."EmailTemplate" ("tenantId", "key");

CREATE TABLE "ops"."WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "ops"."WebhookEvent" ("provider", "eventId");
