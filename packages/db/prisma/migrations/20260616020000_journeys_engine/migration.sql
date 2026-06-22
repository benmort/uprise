-- Phase 4: journeys engine. Additive — new enums + tables only.

CREATE TYPE "JourneyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "JourneyRungType" AS ENUM ('wait', 'condition', 'action');
CREATE TYPE "JourneyTriggerType" AS ENUM ('disposition_set', 'message_received', 'tag_added', 'survey_answer', 'no_answer_after');
CREATE TYPE "JourneyEnrolmentState" AS ENUM ('ACTIVE', 'WAITING', 'COMPLETED', 'EXITED', 'FAILED');

CREATE TABLE "Journey" (
  "id"                     TEXT NOT NULL,
  "organizationId"         TEXT NOT NULL,
  "name"                   TEXT NOT NULL,
  "status"                 "JourneyStatus" NOT NULL DEFAULT 'DRAFT',
  "triggerType"            "JourneyTriggerType" NOT NULL,
  "triggerConfig"          JSONB NOT NULL,
  "reentryCooldownMinutes" INTEGER NOT NULL DEFAULT 0,
  "maxActivePerContact"    INTEGER NOT NULL DEFAULT 1,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Journey_organizationId_status_triggerType_idx" ON "Journey" ("organizationId", "status", "triggerType");

CREATE TABLE "JourneyRung" (
  "id"        TEXT NOT NULL,
  "journeyId" TEXT NOT NULL,
  "rungIndex" INTEGER NOT NULL,
  "type"      "JourneyRungType" NOT NULL,
  "config"    JSONB NOT NULL,
  CONSTRAINT "JourneyRung_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JourneyRung_journeyId_rungIndex_key" ON "JourneyRung" ("journeyId", "rungIndex");

CREATE TABLE "JourneyEnrolment" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "journeyId"        TEXT NOT NULL,
  "contactId"        TEXT NOT NULL,
  "currentRungIndex" INTEGER NOT NULL DEFAULT 0,
  "state"            "JourneyEnrolmentState" NOT NULL DEFAULT 'ACTIVE',
  "context"          JSONB,
  "resumeAt"         TIMESTAMP(3),
  "lastRungAt"       TIMESTAMP(3),
  "rungExecCount"    INTEGER NOT NULL DEFAULT 0,
  "enrolledAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"      TIMESTAMP(3),
  CONSTRAINT "JourneyEnrolment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JourneyEnrolment_journeyId_contactId_enrolledAt_key" ON "JourneyEnrolment" ("journeyId", "contactId", "enrolledAt");
CREATE INDEX "JourneyEnrolment_organizationId_state_resumeAt_idx" ON "JourneyEnrolment" ("organizationId", "state", "resumeAt");
CREATE INDEX "JourneyEnrolment_journeyId_contactId_state_idx" ON "JourneyEnrolment" ("journeyId", "contactId", "state");

ALTER TABLE "Journey"          ADD CONSTRAINT "Journey_organizationId_fkey"   FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JourneyRung"      ADD CONSTRAINT "JourneyRung_journeyId_fkey"    FOREIGN KEY ("journeyId")      REFERENCES "Journey"("id")      ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JourneyEnrolment" ADD CONSTRAINT "JourneyEnrolment_journeyId_fkey" FOREIGN KEY ("journeyId")    REFERENCES "Journey"("id")      ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JourneyEnrolment" ADD CONSTRAINT "JourneyEnrolment_contactId_fkey" FOREIGN KEY ("contactId")    REFERENCES "Contact"("id")      ON DELETE CASCADE ON UPDATE CASCADE;
