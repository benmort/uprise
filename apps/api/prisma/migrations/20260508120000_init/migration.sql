-- Initial Yarns SMS Blast schema
CREATE TYPE "AudienceStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "AudienceSource" AS ENUM ('MANUAL', 'CSV', 'ACTION_NETWORK', 'INTERNAL');
CREATE TYPE "BlastStatus" AS ENUM ('DRAFTED', 'PROOFED', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED');
CREATE TYPE "BlastRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'RESPONDED', 'FAILED', 'SKIPPED');
CREATE TYPE "IntegrationType" AS ENUM ('ACTION_NETWORK', 'INTERNAL');
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "IntegrationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "Organization" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "AppUser" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "displayName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Audience" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "createdById" TEXT,
  "name" TEXT NOT NULL,
  "source" "AudienceSource" NOT NULL,
  "status" "AudienceStatus" NOT NULL DEFAULT 'ACTIVE',
  "externalListId" TEXT,
  "syncedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "AudienceContact" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "audienceId" TEXT NOT NULL,
  "externalId" TEXT,
  "phoneE164" TEXT NOT NULL,
  "fullName" TEXT,
  "metadata" JSONB,
  "source" "AudienceSource" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "AudienceImport" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "audienceId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "importedRows" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0,
  "errors" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AudienceSegment" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "audienceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "definition" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Blast" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "audienceId" TEXT,
  "createdById" TEXT,
  "title" TEXT NOT NULL,
  "bodyTemplate" TEXT NOT NULL,
  "status" "BlastStatus" NOT NULL DEFAULT 'DRAFTED',
  "scheduledFor" TIMESTAMP(3),
  "proofedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "BlastTemplate" (
  "id" TEXT PRIMARY KEY,
  "blastId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "BlastRecipient" (
  "id" TEXT PRIMARY KEY,
  "blastId" TEXT NOT NULL,
  "contactId" TEXT,
  "phoneE164" TEXT NOT NULL,
  "renderedBody" TEXT NOT NULL,
  "status" "BlastRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "failureCategory" TEXT,
  "twilioMessageSid" TEXT,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "InboundMessage" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "blastId" TEXT,
  "fromPhone" TEXT NOT NULL,
  "toPhone" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "twilioMessageSid" TEXT UNIQUE,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "threadKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OutboundMessage" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "blastId" TEXT,
  "recipientId" TEXT,
  "toPhone" TEXT NOT NULL,
  "fromPhone" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "BlastRecipientStatus" NOT NULL DEFAULT 'SENT',
  "twilioMessageSid" TEXT UNIQUE,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "IntegrationConnection" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "type" "IntegrationType" NOT NULL,
  "name" TEXT NOT NULL,
  "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "encryptedCredential" TEXT NOT NULL,
  "settings" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "IntegrationSyncJob" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "integrationConnectionId" TEXT NOT NULL,
  "audienceId" TEXT,
  "status" "IntegrationJobStatus" NOT NULL DEFAULT 'QUEUED',
  "query" TEXT,
  "remoteListId" TEXT,
  "syncedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "errorSummary" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AnalyticsSnapshot" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "blastId" TEXT,
  "metricName" TEXT NOT NULL,
  "metricValue" DOUBLE PRECISION NOT NULL,
  "labels" JSONB,
  "bucketAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ConversationState" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "AudienceContact_audience_phone_unique" ON "AudienceContact"("audienceId", "phoneE164");
CREATE UNIQUE INDEX "BlastTemplate_blast_version_unique" ON "BlastTemplate"("blastId", "version");
CREATE UNIQUE INDEX "ConversationState_org_contact_unique" ON "ConversationState"("organizationId", "contactPhone");
CREATE INDEX "Audience_org_status_idx" ON "Audience"("organizationId", "status");
CREATE INDEX "AudienceContact_org_phone_idx" ON "AudienceContact"("organizationId", "phoneE164");
CREATE INDEX "Blast_org_status_idx" ON "Blast"("organizationId", "status");
CREATE INDEX "BlastRecipient_blast_status_idx" ON "BlastRecipient"("blastId", "status");
CREATE INDEX "BlastRecipient_phone_idx" ON "BlastRecipient"("phoneE164");
CREATE INDEX "Inbound_thread_idx" ON "InboundMessage"("organizationId", "threadKey", "receivedAt");
CREATE INDEX "Outbound_lookup_idx" ON "OutboundMessage"("organizationId", "toPhone", "sentAt");
CREATE INDEX "Integration_lookup_idx" ON "IntegrationConnection"("organizationId", "type", "status");
CREATE INDEX "Analytics_metric_bucket_idx" ON "AnalyticsSnapshot"("organizationId", "metricName", "bucketAt");

ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_org_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Audience" ADD CONSTRAINT "Audience_org_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Audience" ADD CONSTRAINT "Audience_user_fk" FOREIGN KEY ("createdById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AudienceContact" ADD CONSTRAINT "AudienceContact_audience_fk" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudienceImport" ADD CONSTRAINT "AudienceImport_audience_fk" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudienceSegment" ADD CONSTRAINT "AudienceSegment_audience_fk" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Blast" ADD CONSTRAINT "Blast_org_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Blast" ADD CONSTRAINT "Blast_audience_fk" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Blast" ADD CONSTRAINT "Blast_user_fk" FOREIGN KEY ("createdById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BlastTemplate" ADD CONSTRAINT "BlastTemplate_blast_fk" FOREIGN KEY ("blastId") REFERENCES "Blast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlastRecipient" ADD CONSTRAINT "BlastRecipient_blast_fk" FOREIGN KEY ("blastId") REFERENCES "Blast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboundMessage" ADD CONSTRAINT "Inbound_org_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboundMessage" ADD CONSTRAINT "Inbound_blast_fk" FOREIGN KEY ("blastId") REFERENCES "Blast"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "Outbound_org_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "Outbound_blast_fk" FOREIGN KEY ("blastId") REFERENCES "Blast"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_org_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationSyncJob" ADD CONSTRAINT "IntegrationSyncJob_connection_fk" FOREIGN KEY ("integrationConnectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_org_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_blast_fk" FOREIGN KEY ("blastId") REFERENCES "Blast"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationState" ADD CONSTRAINT "ConversationState_org_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
