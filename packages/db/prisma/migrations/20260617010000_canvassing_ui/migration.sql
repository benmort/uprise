-- Canvassing UI additions. Additive only: campaign goals, walk-list type,
-- door-knock photo/safety, and the Shift / Suppression / PushSubscription
-- tables that the organiser + compliance + push surfaces need.

CREATE TYPE "WalkListItemListType" AS ENUM ('STATIC', 'DYNAMIC');

-- CanvassCampaign goals (pace-to-target JSON)
ALTER TABLE "CanvassCampaign" ADD COLUMN "goals" JSONB;

-- WalkList type (static vs auto-refreshing dynamic)
ALTER TABLE "WalkList" ADD COLUMN "listType" "WalkListItemListType" NOT NULL DEFAULT 'STATIC';

-- DoorKnock photo + safety flag
ALTER TABLE "DoorKnock" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "DoorKnock" ADD COLUMN "safetyFlag" BOOLEAN;

-- Shift
CREATE TABLE "Shift" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId"     TEXT,
  "turfId"         TEXT,
  "canvasserId"    TEXT,
  "name"           TEXT NOT NULL,
  "location"       TEXT,
  "startsAt"       TIMESTAMP(3) NOT NULL,
  "endsAt"         TIMESTAMP(3) NOT NULL,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Shift_organizationId_campaignId_startsAt_idx" ON "Shift" ("organizationId", "campaignId", "startsAt");
CREATE INDEX "Shift_organizationId_canvasserId_idx" ON "Shift" ("organizationId", "canvasserId");
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CanvassCampaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Suppression
CREATE TABLE "Suppression" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "phoneE164"      TEXT,
  "email"          TEXT,
  "reason"         TEXT,
  "source"         TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Suppression_organizationId_phoneE164_idx" ON "Suppression" ("organizationId", "phoneE164");
CREATE INDEX "Suppression_organizationId_email_idx" ON "Suppression" ("organizationId", "email");
ALTER TABLE "Suppression" ADD CONSTRAINT "Suppression_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PushSubscription
CREATE TABLE "PushSubscription" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId"         TEXT,
  "endpoint"       TEXT NOT NULL,
  "p256dh"         TEXT NOT NULL,
  "auth"           TEXT NOT NULL,
  "userAgent"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushSubscription_organizationId_endpoint_key" ON "PushSubscription" ("organizationId", "endpoint");
CREATE INDEX "PushSubscription_organizationId_userId_idx" ON "PushSubscription" ("organizationId", "userId");
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
