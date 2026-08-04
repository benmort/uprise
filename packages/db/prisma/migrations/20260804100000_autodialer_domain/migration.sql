-- Autodialer domain (absorbed from the standalone autodialer codebase): voice
-- broadcast / robo-poll / transfer / electoral-target campaigns + the
-- click-to-call widget sessions. Additive, hand-written (migrate deploy).
-- Cross-schema references are id-only — no FKs outside this schema.

CREATE SCHEMA IF NOT EXISTS "autodialer";

CREATE TYPE "autodialer"."DialerCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "autodialer"."DialerQuestionType" AS ENUM ('STANDARD', 'SWITCHBOARD');
CREATE TYPE "autodialer"."DialerAnswerType" AS ENUM ('SMS', 'SET_LANGUAGE', 'REDIRECT', 'SWITCHBOARD');
CREATE TYPE "autodialer"."DialerAttemptOutcome" AS ENUM ('PENDING', 'ANSWERED', 'MACHINE', 'NO_ANSWER', 'BUSY', 'FAILED', 'OPTED_OUT', 'CANCELED');
CREATE TYPE "autodialer"."DialerCallKind" AS ENUM ('PHONE', 'WEBRTC');
CREATE TYPE "autodialer"."DialerSessionStatus" AS ENUM ('CREATED', 'CONNECTED', 'BRIDGED', 'ENDED', 'FAILED', 'EXPIRED');

CREATE TABLE "autodialer"."DialerCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "autodialer"."DialerCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "outboundOnly" BOOLEAN NOT NULL DEFAULT false,
    "publicVisible" BOOLEAN NOT NULL DEFAULT false,
    "survey" BOOLEAN NOT NULL DEFAULT false,
    "electoralTarget" BOOLEAN NOT NULL DEFAULT false,
    "transparentTargetTransfer" BOOLEAN NOT NULL DEFAULT false,
    "audienceId" TEXT,
    "dailyStart" TEXT NOT NULL DEFAULT '09:00',
    "dailyFinish" TEXT NOT NULL DEFAULT '20:00',
    "dialerPeriodMinutes" INTEGER NOT NULL DEFAULT 5,
    "noCallWindowHours" INTEGER NOT NULL DEFAULT 24,
    "maxCallAttempts" INTEGER NOT NULL DEFAULT 3,
    "batchSize" INTEGER NOT NULL DEFAULT 20,
    "fromNumberId" TEXT,
    "intro" JSONB,
    "outro" JSONB,
    "optOut" JSONB,
    "targetNumbers" JSONB,
    "partyTargets" JSONB,
    "jurisdiction" TEXT,
    "officeTarget" TEXT,
    "amdEnabled" BOOLEAN NOT NULL DEFAULT true,
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
    "lastDialedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DialerCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DialerCampaign_tenantId_status_idx" ON "autodialer"."DialerCampaign"("tenantId", "status");
CREATE INDEX "DialerCampaign_tenantId_createdAt_idx" ON "autodialer"."DialerCampaign"("tenantId", "createdAt");

CREATE TABLE "autodialer"."DialerQuestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "autodialer"."DialerQuestionType" NOT NULL DEFAULT 'STANDARD',
    "audioPrompt" JSONB,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DialerQuestion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DialerQuestion_campaignId_fkey" FOREIGN KEY ("campaignId")
      REFERENCES "autodialer"."DialerCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DialerQuestion_campaignId_key_key" ON "autodialer"."DialerQuestion"("campaignId", "key");
CREATE INDEX "DialerQuestion_tenantId_idx" ON "autodialer"."DialerQuestion"("tenantId");

CREATE TABLE "autodialer"."DialerAnswer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "digit" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "nextKey" TEXT,
    "type" "autodialer"."DialerAnswerType",
    "content" TEXT,
    "transfer" BOOLEAN NOT NULL DEFAULT false,
    "dispositionCode" TEXT,
    "supportLevel" "canvass"."SupportLevel",

    CONSTRAINT "DialerAnswer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DialerAnswer_campaignId_fkey" FOREIGN KEY ("campaignId")
      REFERENCES "autodialer"."DialerCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DialerAnswer_questionId_fkey" FOREIGN KEY ("questionId")
      REFERENCES "autodialer"."DialerQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DialerAnswer_questionId_digit_key" ON "autodialer"."DialerAnswer"("questionId", "digit");
CREATE INDEX "DialerAnswer_campaignId_idx" ON "autodialer"."DialerAnswer"("campaignId");

CREATE TABLE "autodialer"."DialerAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT,
    "phoneE164" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "kind" "autodialer"."DialerCallKind" NOT NULL DEFAULT 'PHONE',
    "callId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "outcome" "autodialer"."DialerAttemptOutcome" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DialerAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DialerAttempt_campaignId_phoneE164_attemptNo_key" ON "autodialer"."DialerAttempt"("campaignId", "phoneE164", "attemptNo");
CREATE INDEX "DialerAttempt_campaignId_phoneE164_idx" ON "autodialer"."DialerAttempt"("campaignId", "phoneE164");
CREATE INDEX "DialerAttempt_campaignId_outcome_idx" ON "autodialer"."DialerAttempt"("campaignId", "outcome");
CREATE INDEX "DialerAttempt_callId_idx" ON "autodialer"."DialerAttempt"("callId");
CREATE INDEX "DialerAttempt_tenantId_createdAt_idx" ON "autodialer"."DialerAttempt"("tenantId", "createdAt");

CREATE TABLE "autodialer"."DialerCallSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "actionPageId" TEXT,
    "status" "autodialer"."DialerSessionStatus" NOT NULL DEFAULT 'CREATED',
    "callId" TEXT,
    "targetCallId" TEXT,
    "conferenceName" TEXT,
    "supporterName" TEXT,
    "supporterEmail" TEXT,
    "supporterPhone" TEXT,
    "targetNumber" TEXT,
    "targetName" TEXT,
    "targetParty" TEXT,
    "targetElectorate" TEXT,
    "postcode" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "embedAncestor" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DialerCallSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DialerCallSession_conferenceName_key" ON "autodialer"."DialerCallSession"("conferenceName");
CREATE INDEX "DialerCallSession_tenantId_campaignId_createdAt_idx" ON "autodialer"."DialerCallSession"("tenantId", "campaignId", "createdAt");
CREATE INDEX "DialerCallSession_actionPageId_createdAt_idx" ON "autodialer"."DialerCallSession"("actionPageId", "createdAt");
CREATE INDEX "DialerCallSession_callId_idx" ON "autodialer"."DialerCallSession"("callId");
CREATE INDEX "DialerCallSession_status_expiresAt_idx" ON "autodialer"."DialerCallSession"("status", "expiresAt");

CREATE TABLE "autodialer"."DialerSessionEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DialerSessionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DialerSessionEvent_sessionId_seq_idx" ON "autodialer"."DialerSessionEvent"("sessionId", "seq");
CREATE INDEX "DialerSessionEvent_tenantId_createdAt_idx" ON "autodialer"."DialerSessionEvent"("tenantId", "createdAt");

CREATE TABLE "autodialer"."DialerRedirect" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "callId" TEXT,
    "sessionId" TEXT,
    "contactId" TEXT,
    "targetNumber" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "redirectNumber" TEXT,
    "targetName" TEXT,
    "targetParty" TEXT,
    "electorate" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DialerRedirect_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DialerRedirect_tenantId_campaignId_createdAt_idx" ON "autodialer"."DialerRedirect"("tenantId", "campaignId", "createdAt");
CREATE INDEX "DialerRedirect_callId_idx" ON "autodialer"."DialerRedirect"("callId");

CREATE TABLE "autodialer"."DialerSurveyResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "attemptId" TEXT,
    "sessionId" TEXT,
    "contactId" TEXT,
    "questionKey" TEXT NOT NULL,
    "answerDigit" TEXT NOT NULL,
    "answerValue" TEXT NOT NULL,
    "dispositionCode" TEXT,
    "supportLevel" "canvass"."SupportLevel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DialerSurveyResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DialerSurveyResult_callId_questionKey_key" ON "autodialer"."DialerSurveyResult"("callId", "questionKey");
CREATE INDEX "DialerSurveyResult_tenantId_campaignId_questionKey_idx" ON "autodialer"."DialerSurveyResult"("tenantId", "campaignId", "questionKey");
CREATE INDEX "DialerSurveyResult_campaignId_createdAt_idx" ON "autodialer"."DialerSurveyResult"("campaignId", "createdAt");
