-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "analytics";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audience";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "canvass";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "iam";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "integration";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "journey";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "messaging";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "tenant";

-- CreateEnum
CREATE TYPE "audience"."AudienceStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "audience"."AudienceSource" AS ENUM ('MANUAL', 'CSV', 'ACTION_NETWORK', 'INTERNAL');

-- CreateEnum
CREATE TYPE "audience"."AudienceChannel" AS ENUM ('SMS', 'WHATSAPP', 'ALL');

-- CreateEnum
CREATE TYPE "audience"."AudienceKind" AS ENUM ('STATIC', 'WHATSAPP_OPTED_IN');

-- CreateEnum
CREATE TYPE "audience"."AudienceImportStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "messaging"."BlastStatus" AS ENUM ('DRAFTED', 'PROOFED', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "messaging"."BlastRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'RESPONDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "messaging"."MessageChannel" AS ENUM ('SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "messaging"."ConsentState" AS ENUM ('UNKNOWN', 'OPTED_IN', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "integration"."IntegrationType" AS ENUM ('ACTION_NETWORK', 'INTERNAL');

-- CreateEnum
CREATE TYPE "integration"."IntegrationConnectionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "integration"."IntegrationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "canvass"."EngagementChannel" AS ENUM ('DOOR', 'SMS', 'BOTH');

-- CreateEnum
CREATE TYPE "canvass"."QuestionType" AS ENUM ('yes_no', 'single_choice', 'multi_choice', 'text', 'scale');

-- CreateEnum
CREATE TYPE "canvass"."DispositionLayer" AS ENUM ('CONTACT_RESULT', 'TERMINAL', 'DATA_QUALITY');

-- CreateEnum
CREATE TYPE "canvass"."SupportLevel" AS ENUM ('STRONG_SUPPORT', 'LEAN_SUPPORT', 'UNDECIDED', 'LEAN_OPPOSE', 'STRONG_OPPOSE');

-- CreateEnum
CREATE TYPE "canvass"."CannedVisibility" AS ENUM ('ORG', 'PERSONAL', 'AUTO_SEND');

-- CreateEnum
CREATE TYPE "journey"."JourneyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "journey"."JourneyRungType" AS ENUM ('wait', 'condition', 'action');

-- CreateEnum
CREATE TYPE "journey"."JourneyTriggerType" AS ENUM ('disposition_set', 'message_received', 'tag_added', 'survey_answer', 'no_answer_after');

-- CreateEnum
CREATE TYPE "journey"."JourneyEnrolmentState" AS ENUM ('ACTIVE', 'WAITING', 'COMPLETED', 'EXITED', 'FAILED');

-- CreateEnum
CREATE TYPE "iam"."AppUserRole" AS ENUM ('ORGANISER', 'CANVASSER');

-- CreateEnum
CREATE TYPE "canvass"."CanvassCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "canvass"."TurfAssignmentStatus" AS ENUM ('ASSIGNED', 'RELEASED');

-- CreateEnum
CREATE TYPE "canvass"."WalkListItemStatus" AS ENUM ('PENDING', 'VISITED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "canvass"."WalkListItemListType" AS ENUM ('STATIC', 'DYNAMIC');

-- CreateTable
CREATE TABLE "tenant"."Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "networkId" TEXT,
    "settings" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phoneE164" TEXT,
    "addressNorm" TEXT,
    "gnafPid" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "turfId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "twofaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twofaSecret" TEXT,
    "mobile" TEXT,
    "mobileVerified" BOOLEAN NOT NULL DEFAULT false,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience"."Audience" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "source" "audience"."AudienceSource" NOT NULL,
    "channel" "audience"."AudienceChannel" NOT NULL DEFAULT 'ALL',
    "kind" "audience"."AudienceKind" NOT NULL DEFAULT 'STATIC',
    "status" "audience"."AudienceStatus" NOT NULL DEFAULT 'ACTIVE',
    "externalListId" TEXT,
    "syncedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience"."AudienceContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "contactId" TEXT,
    "externalId" TEXT,
    "phoneE164" TEXT NOT NULL,
    "fullName" TEXT,
    "metadata" JSONB,
    "source" "audience"."AudienceSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience"."AudienceImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "audience"."AudienceImportStatus" NOT NULL DEFAULT 'QUEUED',
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "csvRaw" TEXT NOT NULL,
    "errors" JSONB,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience"."AudienceSegment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."Blast" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "audienceId" TEXT,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "channel" "messaging"."MessageChannel" NOT NULL DEFAULT 'SMS',
    "contentSid" TEXT,
    "contentVariableMap" JSONB,
    "status" "messaging"."BlastStatus" NOT NULL DEFAULT 'DRAFTED',
    "scheduledFor" TIMESTAMP(3),
    "proofedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Blast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."BlastTemplate" (
    "id" TEXT NOT NULL,
    "blastId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlastTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."BlastRecipient" (
    "id" TEXT NOT NULL,
    "blastId" TEXT NOT NULL,
    "contactId" TEXT,
    "phoneE164" TEXT NOT NULL,
    "channel" "messaging"."MessageChannel" NOT NULL DEFAULT 'SMS',
    "renderedBody" TEXT NOT NULL,
    "status" "messaging"."BlastRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "failureCategory" TEXT,
    "twilioMessageSid" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."InboundMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "blastId" TEXT,
    "contactId" TEXT,
    "channel" "messaging"."MessageChannel" NOT NULL DEFAULT 'SMS',
    "fromPhone" TEXT NOT NULL,
    "toPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaContentType" TEXT,
    "twilioMessageSid" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "threadKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."OutboundMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "blastId" TEXT,
    "recipientId" TEXT,
    "contactId" TEXT,
    "channel" "messaging"."MessageChannel" NOT NULL DEFAULT 'SMS',
    "toPhone" TEXT NOT NULL,
    "fromPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaContentType" TEXT,
    "status" "messaging"."BlastRecipientStatus" NOT NULL DEFAULT 'SENT',
    "twilioMessageSid" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."ContactConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT,
    "phoneE164" TEXT NOT NULL,
    "channel" "messaging"."MessageChannel" NOT NULL,
    "state" "messaging"."ConsentState" NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."WhatsappTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contentSid" TEXT NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "variables" JSONB,
    "bodyPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration"."IntegrationConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "integration"."IntegrationType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "integration"."IntegrationConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "encryptedCredential" TEXT NOT NULL,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration"."IntegrationSyncJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationConnectionId" TEXT NOT NULL,
    "audienceId" TEXT,
    "status" "integration"."IntegrationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "query" TEXT,
    "remoteListId" TEXT,
    "syncedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "blastId" TEXT,
    "metricName" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION NOT NULL,
    "labels" JSONB,
    "bucketAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."ConversationState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT,
    "contactPhone" TEXT NOT NULL,
    "channel" "messaging"."MessageChannel" NOT NULL DEFAULT 'SMS',
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."Script" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "canvass"."EngagementChannel" NOT NULL DEFAULT 'BOTH',
    "campaignId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."ScriptStep" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "parentStepId" TEXT,
    "outcomeKey" TEXT,
    "bodyText" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScriptStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."Survey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campaignId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."Question" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "type" "canvass"."QuestionType" NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "scaleMin" INTEGER,
    "scaleMax" INTEGER,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "dispositionCode" TEXT,
    "supportLevel" "canvass"."SupportLevel",
    "cannedReplyText" TEXT,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."QuestionResponse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionId" TEXT,
    "valueText" TEXT,
    "channel" "canvass"."EngagementChannel" NOT NULL,
    "campaignId" TEXT,
    "blastId" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."DispositionDef" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "layer" "canvass"."DispositionLayer" NOT NULL,
    "channel" "canvass"."EngagementChannel" NOT NULL DEFAULT 'BOTH',
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DispositionDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."Disposition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "layer" "canvass"."DispositionLayer" NOT NULL,
    "channel" "canvass"."EngagementChannel" NOT NULL,
    "campaignId" TEXT,
    "blastId" TEXT,
    "scriptStepId" TEXT,
    "cannedResponseId" TEXT,
    "supportLevel" "canvass"."SupportLevel",
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Disposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."CannedResponse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" "canvass"."EngagementChannel" NOT NULL DEFAULT 'SMS',
    "visibility" "canvass"."CannedVisibility" NOT NULL DEFAULT 'ORG',
    "dispositionCode" TEXT,
    "surveyOptionId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CannedResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey"."Journey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "journey"."JourneyStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerType" "journey"."JourneyTriggerType" NOT NULL,
    "triggerConfig" JSONB NOT NULL,
    "reentryCooldownMinutes" INTEGER NOT NULL DEFAULT 0,
    "maxActivePerContact" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey"."JourneyRung" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "rungIndex" INTEGER NOT NULL,
    "type" "journey"."JourneyRungType" NOT NULL,
    "config" JSONB NOT NULL,

    CONSTRAINT "JourneyRung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey"."JourneyEnrolment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "currentRungIndex" INTEGER NOT NULL DEFAULT 0,
    "state" "journey"."JourneyEnrolmentState" NOT NULL DEFAULT 'ACTIVE',
    "context" JSONB,
    "resumeAt" TIMESTAMP(3),
    "lastRungAt" TIMESTAMP(3),
    "rungExecCount" INTEGER NOT NULL DEFAULT 0,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "JourneyEnrolment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."CanvassCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "canvass"."CanvassCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "surveyId" TEXT,
    "scriptId" TEXT,
    "goals" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvassCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."Turf" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Turf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."TurfAssignment" (
    "id" TEXT NOT NULL,
    "turfId" TEXT NOT NULL,
    "canvasserId" TEXT NOT NULL,
    "status" "canvass"."TurfAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "lockedUntil" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "TurfAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."WalkList" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "turfId" TEXT,
    "name" TEXT NOT NULL,
    "listType" "canvass"."WalkListItemListType" NOT NULL DEFAULT 'STATIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalkList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."WalkListItem" (
    "id" TEXT NOT NULL,
    "walkListId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "status" "canvass"."WalkListItemStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "WalkListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."DoorKnock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "canvasserId" TEXT,
    "walkListItemId" TEXT,
    "localId" TEXT NOT NULL,
    "dispositionCode" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "notes" TEXT,
    "photoUrl" TEXT,
    "safetyFlag" BOOLEAN,
    "clientCapturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoorKnock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvass"."Shift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "turfId" TEXT,
    "canvasserId" TEXT,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."Suppression" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phoneE164" TEXT,
    "email" TEXT,
    "reason" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."Network" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT,
    "planName" TEXT,
    "subscriptionStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Network_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."TenantMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "iam"."AppUserRole" NOT NULL,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant"."TenantInvitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "iam"."AppUserRole" NOT NULL,
    "status" TEXT NOT NULL,
    "token" TEXT,
    "expiresAt" TIMESTAMP(3),
    "invitedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."MagicLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."MobileVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "tenant"."Tenant"("slug");

-- CreateIndex
CREATE INDEX "Contact_tenantId_phoneE164_idx" ON "Contact"("tenantId", "phoneE164");

-- CreateIndex
CREATE INDEX "Contact_tenantId_addressNorm_idx" ON "Contact"("tenantId", "addressNorm");

-- CreateIndex
CREATE INDEX "Contact_tenantId_turfId_idx" ON "Contact"("tenantId", "turfId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_gnafPid_idx" ON "Contact"("tenantId", "gnafPid");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "iam"."User"("email");

-- CreateIndex
CREATE INDEX "Audience_tenantId_status_idx" ON "audience"."Audience"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AudienceContact_tenantId_phoneE164_idx" ON "audience"."AudienceContact"("tenantId", "phoneE164");

-- CreateIndex
CREATE INDEX "AudienceContact_contactId_idx" ON "audience"."AudienceContact"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "AudienceContact_audienceId_phoneE164_key" ON "audience"."AudienceContact"("audienceId", "phoneE164");

-- CreateIndex
CREATE INDEX "AudienceImport_tenantId_status_createdAt_idx" ON "audience"."AudienceImport"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Blast_tenantId_status_idx" ON "messaging"."Blast"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BlastTemplate_blastId_version_key" ON "messaging"."BlastTemplate"("blastId", "version");

-- CreateIndex
CREATE INDEX "BlastRecipient_blastId_status_idx" ON "messaging"."BlastRecipient"("blastId", "status");

-- CreateIndex
CREATE INDEX "BlastRecipient_phoneE164_idx" ON "messaging"."BlastRecipient"("phoneE164");

-- CreateIndex
CREATE INDEX "BlastRecipient_contactId_idx" ON "messaging"."BlastRecipient"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "BlastRecipient_blastId_phoneE164_key" ON "messaging"."BlastRecipient"("blastId", "phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_twilioMessageSid_key" ON "messaging"."InboundMessage"("twilioMessageSid");

-- CreateIndex
CREATE INDEX "InboundMessage_tenantId_threadKey_receivedAt_idx" ON "messaging"."InboundMessage"("tenantId", "threadKey", "receivedAt");

-- CreateIndex
CREATE INDEX "InboundMessage_contactId_idx" ON "messaging"."InboundMessage"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_twilioMessageSid_key" ON "messaging"."OutboundMessage"("twilioMessageSid");

-- CreateIndex
CREATE INDEX "OutboundMessage_tenantId_toPhone_sentAt_idx" ON "messaging"."OutboundMessage"("tenantId", "toPhone", "sentAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_contactId_idx" ON "messaging"."OutboundMessage"("contactId");

-- CreateIndex
CREATE INDEX "ContactConsent_tenantId_channel_state_idx" ON "messaging"."ContactConsent"("tenantId", "channel", "state");

-- CreateIndex
CREATE INDEX "ContactConsent_contactId_idx" ON "messaging"."ContactConsent"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactConsent_tenantId_phoneE164_channel_key" ON "messaging"."ContactConsent"("tenantId", "phoneE164", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappTemplate_contentSid_key" ON "messaging"."WhatsappTemplate"("contentSid");

-- CreateIndex
CREATE INDEX "WhatsappTemplate_tenantId_status_idx" ON "messaging"."WhatsappTemplate"("tenantId", "status");

-- CreateIndex
CREATE INDEX "IntegrationConnection_tenantId_type_status_idx" ON "integration"."IntegrationConnection"("tenantId", "type", "status");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_tenantId_metricName_bucketAt_idx" ON "analytics"."AnalyticsSnapshot"("tenantId", "metricName", "bucketAt");

-- CreateIndex
CREATE INDEX "ConversationState_contactId_idx" ON "messaging"."ConversationState"("contactId");

-- CreateIndex
CREATE INDEX "ConversationState_tenantId_ownerId_idx" ON "messaging"."ConversationState"("tenantId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationState_tenantId_contactPhone_channel_key" ON "messaging"."ConversationState"("tenantId", "contactPhone", "channel");

-- CreateIndex
CREATE INDEX "Script_tenantId_channel_isArchived_idx" ON "canvass"."Script"("tenantId", "channel", "isArchived");

-- CreateIndex
CREATE INDEX "ScriptStep_scriptId_parentStepId_orderIndex_idx" ON "canvass"."ScriptStep"("scriptId", "parentStepId", "orderIndex");

-- CreateIndex
CREATE INDEX "Survey_tenantId_isArchived_idx" ON "canvass"."Survey"("tenantId", "isArchived");

-- CreateIndex
CREATE INDEX "Question_surveyId_orderIndex_idx" ON "canvass"."Question"("surveyId", "orderIndex");

-- CreateIndex
CREATE INDEX "QuestionOption_questionId_orderIndex_idx" ON "canvass"."QuestionOption"("questionId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionId_value_key" ON "canvass"."QuestionOption"("questionId", "value");

-- CreateIndex
CREATE INDEX "QuestionResponse_tenantId_contactId_createdAt_idx" ON "canvass"."QuestionResponse"("tenantId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionResponse_questionId_optionId_idx" ON "canvass"."QuestionResponse"("questionId", "optionId");

-- CreateIndex
CREATE INDEX "DispositionDef_tenantId_layer_channel_idx" ON "canvass"."DispositionDef"("tenantId", "layer", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "DispositionDef_tenantId_code_key" ON "canvass"."DispositionDef"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Disposition_tenantId_contactId_createdAt_idx" ON "canvass"."Disposition"("tenantId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Disposition_tenantId_code_createdAt_idx" ON "canvass"."Disposition"("tenantId", "code", "createdAt");

-- CreateIndex
CREATE INDEX "CannedResponse_tenantId_channel_visibility_isArchived_idx" ON "canvass"."CannedResponse"("tenantId", "channel", "visibility", "isArchived");

-- CreateIndex
CREATE INDEX "CannedResponse_tenantId_ownerId_idx" ON "canvass"."CannedResponse"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Journey_tenantId_status_triggerType_idx" ON "journey"."Journey"("tenantId", "status", "triggerType");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyRung_journeyId_rungIndex_key" ON "journey"."JourneyRung"("journeyId", "rungIndex");

-- CreateIndex
CREATE INDEX "JourneyEnrolment_tenantId_state_resumeAt_idx" ON "journey"."JourneyEnrolment"("tenantId", "state", "resumeAt");

-- CreateIndex
CREATE INDEX "JourneyEnrolment_journeyId_contactId_state_idx" ON "journey"."JourneyEnrolment"("journeyId", "contactId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyEnrolment_journeyId_contactId_enrolledAt_key" ON "journey"."JourneyEnrolment"("journeyId", "contactId", "enrolledAt");

-- CreateIndex
CREATE INDEX "CanvassCampaign_tenantId_status_idx" ON "canvass"."CanvassCampaign"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Turf_tenantId_campaignId_idx" ON "canvass"."Turf"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "TurfAssignment_turfId_status_idx" ON "canvass"."TurfAssignment"("turfId", "status");

-- CreateIndex
CREATE INDEX "TurfAssignment_canvasserId_status_idx" ON "canvass"."TurfAssignment"("canvasserId", "status");

-- CreateIndex
CREATE INDEX "WalkList_tenantId_campaignId_idx" ON "canvass"."WalkList"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "WalkListItem_walkListId_orderIndex_idx" ON "canvass"."WalkListItem"("walkListId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "WalkListItem_walkListId_contactId_key" ON "canvass"."WalkListItem"("walkListId", "contactId");

-- CreateIndex
CREATE INDEX "DoorKnock_tenantId_contactId_createdAt_idx" ON "canvass"."DoorKnock"("tenantId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "DoorKnock_canvasserId_createdAt_idx" ON "canvass"."DoorKnock"("canvasserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DoorKnock_tenantId_localId_key" ON "canvass"."DoorKnock"("tenantId", "localId");

-- CreateIndex
CREATE INDEX "Shift_tenantId_campaignId_startsAt_idx" ON "canvass"."Shift"("tenantId", "campaignId", "startsAt");

-- CreateIndex
CREATE INDEX "Shift_tenantId_canvasserId_idx" ON "canvass"."Shift"("tenantId", "canvasserId");

-- CreateIndex
CREATE INDEX "Suppression_tenantId_phoneE164_idx" ON "messaging"."Suppression"("tenantId", "phoneE164");

-- CreateIndex
CREATE INDEX "Suppression_tenantId_email_idx" ON "messaging"."Suppression"("tenantId", "email");

-- CreateIndex
CREATE INDEX "PushSubscription_tenantId_userId_idx" ON "PushSubscription"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_tenantId_endpoint_key" ON "PushSubscription"("tenantId", "endpoint");

-- CreateIndex
CREATE INDEX "Network_ownerId_idx" ON "tenant"."Network"("ownerId");

-- CreateIndex
CREATE INDEX "TenantMember_tenantId_role_idx" ON "tenant"."TenantMember"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMember_tenantId_userId_key" ON "tenant"."TenantMember"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvitation_token_key" ON "tenant"."TenantInvitation"("token");

-- CreateIndex
CREATE INDEX "TenantInvitation_tenantId_status_idx" ON "tenant"."TenantInvitation"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvitation_tenantId_email_key" ON "tenant"."TenantInvitation"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "iam"."Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "iam"."Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLink_token_key" ON "iam"."MagicLink"("token");

-- CreateIndex
CREATE INDEX "MagicLink_userId_idx" ON "iam"."MagicLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_token_key" ON "iam"."PasswordReset"("token");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "iam"."PasswordReset"("userId");

-- CreateIndex
CREATE INDEX "MobileVerification_userId_idx" ON "iam"."MobileVerification"("userId");

-- AddForeignKey
ALTER TABLE "tenant"."Tenant" ADD CONSTRAINT "Tenant_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "tenant"."Network"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_turfId_fkey" FOREIGN KEY ("turfId") REFERENCES "canvass"."Turf"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience"."Audience" ADD CONSTRAINT "Audience_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience"."Audience" ADD CONSTRAINT "Audience_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "iam"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience"."AudienceContact" ADD CONSTRAINT "AudienceContact_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "audience"."Audience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience"."AudienceContact" ADD CONSTRAINT "AudienceContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience"."AudienceImport" ADD CONSTRAINT "AudienceImport_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "audience"."Audience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience"."AudienceSegment" ADD CONSTRAINT "AudienceSegment_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "audience"."Audience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."Blast" ADD CONSTRAINT "Blast_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."Blast" ADD CONSTRAINT "Blast_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "audience"."Audience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."Blast" ADD CONSTRAINT "Blast_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "iam"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."BlastTemplate" ADD CONSTRAINT "BlastTemplate_blastId_fkey" FOREIGN KEY ("blastId") REFERENCES "messaging"."Blast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."BlastRecipient" ADD CONSTRAINT "BlastRecipient_blastId_fkey" FOREIGN KEY ("blastId") REFERENCES "messaging"."Blast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."BlastRecipient" ADD CONSTRAINT "BlastRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."InboundMessage" ADD CONSTRAINT "InboundMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."InboundMessage" ADD CONSTRAINT "InboundMessage_blastId_fkey" FOREIGN KEY ("blastId") REFERENCES "messaging"."Blast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."InboundMessage" ADD CONSTRAINT "InboundMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."OutboundMessage" ADD CONSTRAINT "OutboundMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."OutboundMessage" ADD CONSTRAINT "OutboundMessage_blastId_fkey" FOREIGN KEY ("blastId") REFERENCES "messaging"."Blast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."OutboundMessage" ADD CONSTRAINT "OutboundMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."ContactConsent" ADD CONSTRAINT "ContactConsent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."ContactConsent" ADD CONSTRAINT "ContactConsent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."WhatsappTemplate" ADD CONSTRAINT "WhatsappTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration"."IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration"."IntegrationSyncJob" ADD CONSTRAINT "IntegrationSyncJob_integrationConnectionId_fkey" FOREIGN KEY ("integrationConnectionId") REFERENCES "integration"."IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics"."AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics"."AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_blastId_fkey" FOREIGN KEY ("blastId") REFERENCES "messaging"."Blast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."ConversationState" ADD CONSTRAINT "ConversationState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."ConversationState" ADD CONSTRAINT "ConversationState_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."Script" ADD CONSTRAINT "Script_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."ScriptStep" ADD CONSTRAINT "ScriptStep_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "canvass"."Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."ScriptStep" ADD CONSTRAINT "ScriptStep_parentStepId_fkey" FOREIGN KEY ("parentStepId") REFERENCES "canvass"."ScriptStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."Survey" ADD CONSTRAINT "Survey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."Question" ADD CONSTRAINT "Question_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "canvass"."Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "canvass"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."QuestionResponse" ADD CONSTRAINT "QuestionResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."QuestionResponse" ADD CONSTRAINT "QuestionResponse_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."QuestionResponse" ADD CONSTRAINT "QuestionResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "canvass"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."QuestionResponse" ADD CONSTRAINT "QuestionResponse_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "canvass"."QuestionOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."DispositionDef" ADD CONSTRAINT "DispositionDef_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."Disposition" ADD CONSTRAINT "Disposition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."Disposition" ADD CONSTRAINT "Disposition_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."CannedResponse" ADD CONSTRAINT "CannedResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey"."Journey" ADD CONSTRAINT "Journey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey"."JourneyRung" ADD CONSTRAINT "JourneyRung_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "journey"."Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey"."JourneyEnrolment" ADD CONSTRAINT "JourneyEnrolment_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "journey"."Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey"."JourneyEnrolment" ADD CONSTRAINT "JourneyEnrolment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."CanvassCampaign" ADD CONSTRAINT "CanvassCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."Turf" ADD CONSTRAINT "Turf_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."Turf" ADD CONSTRAINT "Turf_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "canvass"."CanvassCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."TurfAssignment" ADD CONSTRAINT "TurfAssignment_turfId_fkey" FOREIGN KEY ("turfId") REFERENCES "canvass"."Turf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."TurfAssignment" ADD CONSTRAINT "TurfAssignment_canvasserId_fkey" FOREIGN KEY ("canvasserId") REFERENCES "iam"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."WalkList" ADD CONSTRAINT "WalkList_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."WalkList" ADD CONSTRAINT "WalkList_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "canvass"."CanvassCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."WalkList" ADD CONSTRAINT "WalkList_turfId_fkey" FOREIGN KEY ("turfId") REFERENCES "canvass"."Turf"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."WalkListItem" ADD CONSTRAINT "WalkListItem_walkListId_fkey" FOREIGN KEY ("walkListId") REFERENCES "canvass"."WalkList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."WalkListItem" ADD CONSTRAINT "WalkListItem_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."DoorKnock" ADD CONSTRAINT "DoorKnock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."DoorKnock" ADD CONSTRAINT "DoorKnock_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."DoorKnock" ADD CONSTRAINT "DoorKnock_canvasserId_fkey" FOREIGN KEY ("canvasserId") REFERENCES "iam"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."Shift" ADD CONSTRAINT "Shift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvass"."Shift" ADD CONSTRAINT "Shift_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "canvass"."CanvassCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."Suppression" ADD CONSTRAINT "Suppression_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."TenantMember" ADD CONSTRAINT "TenantMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."TenantMember" ADD CONSTRAINT "TenantMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "iam"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant"."TenantInvitation" ADD CONSTRAINT "TenantInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "iam"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── partial unique indexes (Prisma DSL can't express; hand-maintained) ──
CREATE UNIQUE INDEX "Contact_tenantId_phoneE164_key" ON "public"."Contact" ("tenantId", "phoneE164") WHERE "phoneE164" IS NOT NULL;
CREATE UNIQUE INDEX "Contact_tenantId_addressNorm_key" ON "public"."Contact" ("tenantId", "addressNorm") WHERE "addressNorm" IS NOT NULL;
CREATE UNIQUE INDEX "TurfAssignment_one_active_per_turf" ON "canvass"."TurfAssignment" ("turfId") WHERE "status" = 'ASSIGNED';

-- geo layer (idempotent; preserved across resets)
-- G-NAF + ASGS + electoral/LGA divisions geo layer.
-- Isolated in the `geo` schema; PostGIS for spatial indexes + ST_Contains.
-- Additive: nothing in the default (app) schema changes except Contact.gnafPid.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS geo;

-- ── Dataset provenance (powers /settings/data) ──────────────────────────────
CREATE TABLE IF NOT EXISTS geo.dataset_meta (
  key           TEXT PRIMARY KEY,          -- gnaf | asgs_mb | sa1..sa4 | lga | ced | sed
  label         TEXT NOT NULL,
  source_url    TEXT,
  release_date  TEXT,
  licence       TEXT,
  row_count     BIGINT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | loading | loaded | error
  last_ingested TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Boundary layers (WGS84 / EPSG:4326) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo.meshblock (
  mb_code   TEXT PRIMARY KEY,
  sa1_code  TEXT, sa2_code TEXT, sa3_code TEXT, sa4_code TEXT,
  lga_code  TEXT, state TEXT,
  geom      geometry(MultiPolygon, 4326)
);
CREATE TABLE IF NOT EXISTS geo.sa1 ( code TEXT PRIMARY KEY, name TEXT, sa2_code TEXT, geom geometry(MultiPolygon,4326) );
CREATE TABLE IF NOT EXISTS geo.sa2 ( code TEXT PRIMARY KEY, name TEXT, sa3_code TEXT, geom geometry(MultiPolygon,4326) );
CREATE TABLE IF NOT EXISTS geo.sa3 ( code TEXT PRIMARY KEY, name TEXT, sa4_code TEXT, geom geometry(MultiPolygon,4326) );
CREATE TABLE IF NOT EXISTS geo.sa4 ( code TEXT PRIMARY KEY, name TEXT, state TEXT, geom geometry(MultiPolygon,4326) );
CREATE TABLE IF NOT EXISTS geo.lga ( code TEXT PRIMARY KEY, name TEXT, state TEXT, geom geometry(MultiPolygon,4326) );
CREATE TABLE IF NOT EXISTS geo.ced ( code TEXT PRIMARY KEY, name TEXT, state TEXT, geom geometry(MultiPolygon,4326) ); -- federal
CREATE TABLE IF NOT EXISTS geo.sed ( code TEXT PRIMARY KEY, name TEXT, state TEXT, geom geometry(MultiPolygon,4326) ); -- state electoral

-- ── G-NAF addresses as points ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo.gnaf_address (
  gnaf_pid      TEXT PRIMARY KEY,
  address_label TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  state         TEXT,
  mb_code       TEXT,
  geom          geometry(Point, 4326)
);

-- ── Materialised per-address region mapping (the app reads this) ─────────────
CREATE TABLE IF NOT EXISTS geo.address_region (
  gnaf_pid  TEXT PRIMARY KEY,
  mb_code   TEXT, sa1_code TEXT, sa2_code TEXT, sa3_code TEXT, sa4_code TEXT,
  lga_code  TEXT, ced_code TEXT, sed_code TEXT
);

-- ── Spatial (GIST) indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS meshblock_geom_gix ON geo.meshblock USING GIST (geom);
CREATE INDEX IF NOT EXISTS sa1_geom_gix ON geo.sa1 USING GIST (geom);
CREATE INDEX IF NOT EXISTS sa2_geom_gix ON geo.sa2 USING GIST (geom);
CREATE INDEX IF NOT EXISTS sa3_geom_gix ON geo.sa3 USING GIST (geom);
CREATE INDEX IF NOT EXISTS sa4_geom_gix ON geo.sa4 USING GIST (geom);
CREATE INDEX IF NOT EXISTS lga_geom_gix ON geo.lga USING GIST (geom);
CREATE INDEX IF NOT EXISTS ced_geom_gix ON geo.ced USING GIST (geom);
CREATE INDEX IF NOT EXISTS sed_geom_gix ON geo.sed USING GIST (geom);
CREATE INDEX IF NOT EXISTS gnaf_geom_gix ON geo.gnaf_address USING GIST (geom);
CREATE INDEX IF NOT EXISTS gnaf_state_idx ON geo.gnaf_address (state);

-- ── Lookup indexes on the mapping ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS address_region_ced_idx ON geo.address_region (ced_code);
CREATE INDEX IF NOT EXISTS address_region_sed_idx ON geo.address_region (sed_code);
CREATE INDEX IF NOT EXISTS address_region_lga_idx ON geo.address_region (lga_code);
CREATE INDEX IF NOT EXISTS address_region_sa1_idx ON geo.address_region (sa1_code);
CREATE INDEX IF NOT EXISTS address_region_mb_idx  ON geo.address_region (mb_code);

-- ── App link: Contact → G-NAF address ───────────────────────────────────────
