-- Phase 3: canvassing domain. Promotes AppUser to an auth principal and adds
-- the turf / walk-list / door-knock tables. Additive (AppUser columns nullable
-- with a default role).

CREATE TYPE "AppUserRole" AS ENUM ('ORGANISER', 'CANVASSER');
CREATE TYPE "CanvassCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "TurfAssignmentStatus" AS ENUM ('ASSIGNED', 'RELEASED');
CREATE TYPE "WalkListItemStatus" AS ENUM ('PENDING', 'VISITED', 'SKIPPED');

-- AppUser promotion
ALTER TABLE "AppUser" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "AppUser" ADD COLUMN "role" "AppUserRole" NOT NULL DEFAULT 'ORGANISER';
CREATE INDEX "AppUser_organizationId_role_idx" ON "AppUser" ("organizationId", "role");

-- CanvassCampaign
CREATE TABLE "CanvassCampaign" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "status"         "CanvassCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "surveyId"       TEXT,
  "scriptId"       TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CanvassCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CanvassCampaign_organizationId_status_idx" ON "CanvassCampaign" ("organizationId", "status");

-- Turf
CREATE TABLE "Turf" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId"     TEXT,
  "name"           TEXT NOT NULL,
  "geometry"       JSONB NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Turf_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Turf_organizationId_campaignId_idx" ON "Turf" ("organizationId", "campaignId");

-- TurfAssignment
CREATE TABLE "TurfAssignment" (
  "id"          TEXT NOT NULL,
  "turfId"      TEXT NOT NULL,
  "canvasserId" TEXT NOT NULL,
  "status"      "TurfAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "lockedUntil" TIMESTAMP(3),
  "assignedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt"  TIMESTAMP(3),
  CONSTRAINT "TurfAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TurfAssignment_turfId_status_idx" ON "TurfAssignment" ("turfId", "status");
CREATE INDEX "TurfAssignment_canvasserId_status_idx" ON "TurfAssignment" ("canvasserId", "status");
-- At most one ASSIGNED lock per turf: two canvassers cannot both own a turf.
CREATE UNIQUE INDEX "TurfAssignment_one_active_per_turf"
  ON "TurfAssignment" ("turfId")
  WHERE "status" = 'ASSIGNED';

-- WalkList / WalkListItem
CREATE TABLE "WalkList" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId"     TEXT,
  "turfId"         TEXT,
  "name"           TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalkList_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WalkList_organizationId_campaignId_idx" ON "WalkList" ("organizationId", "campaignId");

CREATE TABLE "WalkListItem" (
  "id"         TEXT NOT NULL,
  "walkListId" TEXT NOT NULL,
  "contactId"  TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "status"     "WalkListItemStatus" NOT NULL DEFAULT 'PENDING',
  CONSTRAINT "WalkListItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WalkListItem_walkListId_contactId_key" ON "WalkListItem" ("walkListId", "contactId");
CREATE INDEX "WalkListItem_walkListId_orderIndex_idx" ON "WalkListItem" ("walkListId", "orderIndex");

-- DoorKnock
CREATE TABLE "DoorKnock" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "contactId"        TEXT NOT NULL,
  "canvasserId"      TEXT,
  "walkListItemId"   TEXT,
  "localId"          TEXT NOT NULL,
  "dispositionCode"  TEXT,
  "lat"              DOUBLE PRECISION,
  "lng"              DOUBLE PRECISION,
  "notes"            TEXT,
  "clientCapturedAt" TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DoorKnock_pkey" PRIMARY KEY ("id")
);
-- Idempotency: a re-synced offline knock with the same client localId is deduped.
CREATE UNIQUE INDEX "DoorKnock_organizationId_localId_key" ON "DoorKnock" ("organizationId", "localId");
CREATE INDEX "DoorKnock_organizationId_contactId_createdAt_idx" ON "DoorKnock" ("organizationId", "contactId", "createdAt");
CREATE INDEX "DoorKnock_canvasserId_createdAt_idx" ON "DoorKnock" ("canvasserId", "createdAt");

-- Contact → Turf FK (column already exists from Phase 1).
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_turfId_fkey" FOREIGN KEY ("turfId") REFERENCES "Turf"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign keys
ALTER TABLE "CanvassCampaign" ADD CONSTRAINT "CanvassCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Turf"            ADD CONSTRAINT "Turf_organizationId_fkey"            FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Turf"            ADD CONSTRAINT "Turf_campaignId_fkey"                FOREIGN KEY ("campaignId")     REFERENCES "CanvassCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TurfAssignment"  ADD CONSTRAINT "TurfAssignment_turfId_fkey"          FOREIGN KEY ("turfId")         REFERENCES "Turf"("id")            ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TurfAssignment"  ADD CONSTRAINT "TurfAssignment_canvasserId_fkey"     FOREIGN KEY ("canvasserId")    REFERENCES "AppUser"("id")         ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalkList"        ADD CONSTRAINT "WalkList_organizationId_fkey"        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalkList"        ADD CONSTRAINT "WalkList_campaignId_fkey"            FOREIGN KEY ("campaignId")     REFERENCES "CanvassCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalkList"        ADD CONSTRAINT "WalkList_turfId_fkey"                FOREIGN KEY ("turfId")         REFERENCES "Turf"("id")            ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalkListItem"    ADD CONSTRAINT "WalkListItem_walkListId_fkey"        FOREIGN KEY ("walkListId")     REFERENCES "WalkList"("id")        ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalkListItem"    ADD CONSTRAINT "WalkListItem_contactId_fkey"         FOREIGN KEY ("contactId")      REFERENCES "Contact"("id")         ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoorKnock"       ADD CONSTRAINT "DoorKnock_organizationId_fkey"       FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoorKnock"       ADD CONSTRAINT "DoorKnock_contactId_fkey"            FOREIGN KEY ("contactId")      REFERENCES "Contact"("id")         ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoorKnock"       ADD CONSTRAINT "DoorKnock_canvasserId_fkey"          FOREIGN KEY ("canvasserId")    REFERENCES "AppUser"("id")         ON DELETE SET NULL ON UPDATE CASCADE;
