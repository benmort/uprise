-- Phase 2: shared engagement layer (Scripts, Surveys, Dispositions, Canned
-- Responses). All additive — new enums + tables, no changes to existing data.

-- Enums
CREATE TYPE "EngagementChannel" AS ENUM ('DOOR', 'SMS', 'BOTH');
CREATE TYPE "QuestionType" AS ENUM ('yes_no', 'single_choice', 'multi_choice', 'text', 'scale');
CREATE TYPE "DispositionLayer" AS ENUM ('CONTACT_RESULT', 'TERMINAL', 'DATA_QUALITY');
CREATE TYPE "SupportLevel" AS ENUM ('STRONG_SUPPORT', 'LEAN_SUPPORT', 'UNDECIDED', 'LEAN_OPPOSE', 'STRONG_OPPOSE');
CREATE TYPE "CannedVisibility" AS ENUM ('ORG', 'PERSONAL', 'AUTO_SEND');

-- Script / ScriptStep
CREATE TABLE "Script" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "channel"        "EngagementChannel" NOT NULL DEFAULT 'BOTH',
  "campaignId"     TEXT,
  "isArchived"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Script_organizationId_channel_isArchived_idx" ON "Script" ("organizationId", "channel", "isArchived");

CREATE TABLE "ScriptStep" (
  "id"           TEXT NOT NULL,
  "scriptId"     TEXT NOT NULL,
  "parentStepId" TEXT,
  "outcomeKey"   TEXT,
  "bodyText"     TEXT NOT NULL,
  "orderIndex"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ScriptStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScriptStep_scriptId_parentStepId_orderIndex_idx" ON "ScriptStep" ("scriptId", "parentStepId", "orderIndex");

-- Survey / Question / QuestionOption / QuestionResponse
CREATE TABLE "Survey" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "campaignId"     TEXT,
  "isArchived"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Survey_organizationId_isArchived_idx" ON "Survey" ("organizationId", "isArchived");

CREATE TABLE "Question" (
  "id"         TEXT NOT NULL,
  "surveyId"   TEXT NOT NULL,
  "prompt"     TEXT NOT NULL,
  "type"       "QuestionType" NOT NULL,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "required"   BOOLEAN NOT NULL DEFAULT false,
  "scaleMin"   INTEGER,
  "scaleMax"   INTEGER,
  CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Question_surveyId_orderIndex_idx" ON "Question" ("surveyId", "orderIndex");

CREATE TABLE "QuestionOption" (
  "id"              TEXT NOT NULL,
  "questionId"      TEXT NOT NULL,
  "value"           TEXT NOT NULL,
  "label"           TEXT NOT NULL,
  "orderIndex"      INTEGER NOT NULL DEFAULT 0,
  "dispositionCode" TEXT,
  "supportLevel"    "SupportLevel",
  "cannedReplyText" TEXT,
  CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestionOption_questionId_value_key" ON "QuestionOption" ("questionId", "value");
CREATE INDEX "QuestionOption_questionId_orderIndex_idx" ON "QuestionOption" ("questionId", "orderIndex");

CREATE TABLE "QuestionResponse" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "contactId"      TEXT NOT NULL,
  "questionId"     TEXT NOT NULL,
  "optionId"       TEXT,
  "valueText"      TEXT,
  "channel"        "EngagementChannel" NOT NULL,
  "campaignId"     TEXT,
  "blastId"        TEXT,
  "recordedById"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionResponse_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QuestionResponse_organizationId_contactId_createdAt_idx" ON "QuestionResponse" ("organizationId", "contactId", "createdAt");
CREATE INDEX "QuestionResponse_questionId_optionId_idx" ON "QuestionResponse" ("questionId", "optionId");

-- DispositionDef (catalog) / Disposition (recorded)
CREATE TABLE "DispositionDef" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT,
  "code"           TEXT NOT NULL,
  "label"          TEXT NOT NULL,
  "layer"          "DispositionLayer" NOT NULL,
  "channel"        "EngagementChannel" NOT NULL DEFAULT 'BOTH',
  "isTerminal"     BOOLEAN NOT NULL DEFAULT false,
  "isLocked"       BOOLEAN NOT NULL DEFAULT false,
  "orderIndex"     INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "DispositionDef_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DispositionDef_organizationId_code_key" ON "DispositionDef" ("organizationId", "code");
CREATE INDEX "DispositionDef_organizationId_layer_channel_idx" ON "DispositionDef" ("organizationId", "layer", "channel");

CREATE TABLE "Disposition" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "contactId"        TEXT NOT NULL,
  "code"             TEXT NOT NULL,
  "layer"            "DispositionLayer" NOT NULL,
  "channel"          "EngagementChannel" NOT NULL,
  "campaignId"       TEXT,
  "blastId"          TEXT,
  "scriptStepId"     TEXT,
  "cannedResponseId" TEXT,
  "supportLevel"     "SupportLevel",
  "recordedById"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Disposition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Disposition_organizationId_contactId_createdAt_idx" ON "Disposition" ("organizationId", "contactId", "createdAt");
CREATE INDEX "Disposition_organizationId_code_createdAt_idx" ON "Disposition" ("organizationId", "code", "createdAt");

-- CannedResponse
CREATE TABLE "CannedResponse" (
  "id"              TEXT NOT NULL,
  "organizationId"  TEXT NOT NULL,
  "ownerId"         TEXT,
  "title"           TEXT NOT NULL,
  "body"            TEXT NOT NULL,
  "channel"         "EngagementChannel" NOT NULL DEFAULT 'SMS',
  "visibility"      "CannedVisibility" NOT NULL DEFAULT 'ORG',
  "dispositionCode" TEXT,
  "surveyOptionId"  TEXT,
  "isArchived"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CannedResponse_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CannedResponse_organizationId_channel_visibility_isArchived_idx" ON "CannedResponse" ("organizationId", "channel", "visibility", "isArchived");
CREATE INDEX "CannedResponse_organizationId_ownerId_idx" ON "CannedResponse" ("organizationId", "ownerId");

-- Foreign keys
ALTER TABLE "Script"          ADD CONSTRAINT "Script_organizationId_fkey"          FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScriptStep"      ADD CONSTRAINT "ScriptStep_scriptId_fkey"            FOREIGN KEY ("scriptId")       REFERENCES "Script"("id")       ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScriptStep"      ADD CONSTRAINT "ScriptStep_parentStepId_fkey"        FOREIGN KEY ("parentStepId")   REFERENCES "ScriptStep"("id")   ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Survey"          ADD CONSTRAINT "Survey_organizationId_fkey"          FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Question"        ADD CONSTRAINT "Question_surveyId_fkey"              FOREIGN KEY ("surveyId")       REFERENCES "Survey"("id")       ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionOption"  ADD CONSTRAINT "QuestionOption_questionId_fkey"      FOREIGN KEY ("questionId")     REFERENCES "Question"("id")     ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionResponse" ADD CONSTRAINT "QuestionResponse_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionResponse" ADD CONSTRAINT "QuestionResponse_contactId_fkey"     FOREIGN KEY ("contactId")     REFERENCES "Contact"("id")      ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionResponse" ADD CONSTRAINT "QuestionResponse_questionId_fkey"    FOREIGN KEY ("questionId")    REFERENCES "Question"("id")     ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionResponse" ADD CONSTRAINT "QuestionResponse_optionId_fkey"      FOREIGN KEY ("optionId")      REFERENCES "QuestionOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DispositionDef"  ADD CONSTRAINT "DispositionDef_organizationId_fkey"  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Disposition"     ADD CONSTRAINT "Disposition_organizationId_fkey"     FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Disposition"     ADD CONSTRAINT "Disposition_contactId_fkey"          FOREIGN KEY ("contactId")     REFERENCES "Contact"("id")      ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CannedResponse"  ADD CONSTRAINT "CannedResponse_organizationId_fkey"  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
