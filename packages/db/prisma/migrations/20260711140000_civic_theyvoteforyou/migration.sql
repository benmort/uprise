-- Civic domain: politicians + policies synced from They Vote For You (OpenAustralia
-- Foundation). Global reference data (no tenantId — like geo.*). A Politician references
-- its electorate id-only by (geoKind, geoCode); geo.* is raw PostGIS, not a Prisma schema,
-- so there is no FK to a region (mirrors insights.PollEstimate).
--
-- Additive; applied with `prisma migrate deploy` (never `migrate dev`).

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "civic";

-- CreateEnum
CREATE TYPE "civic"."House" AS ENUM ('REPS', 'SENATE');

-- CreateTable
CREATE TABLE "civic"."Politician" (
    "id" TEXT NOT NULL,
    "tvfyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "party" TEXT,
    "house" "civic"."House" NOT NULL,
    "electorate" TEXT,
    "geoKind" TEXT,
    "geoCode" TEXT,
    "rebellions" INTEGER,
    "votesAttended" INTEGER,
    "votesPossible" INTEGER,
    "offices" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Politician_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "civic"."Policy" (
    "id" TEXT NOT NULL,
    "tvfyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "provisional" BOOLEAN NOT NULL DEFAULT false,
    "lastEditedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "civic"."PolicyPosition" (
    "id" TEXT NOT NULL,
    "politicianId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "agreement" DECIMAL(5,2),
    "voted" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,

    CONSTRAINT "PolicyPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "civic"."CivicSyncRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "politicians" INTEGER NOT NULL DEFAULT 0,
    "policies" INTEGER NOT NULL DEFAULT 0,
    "positions" INTEGER NOT NULL DEFAULT 0,
    "unmatched" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "CivicSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Politician_tvfyId_key" ON "civic"."Politician"("tvfyId");

-- CreateIndex
CREATE INDEX "Politician_geoKind_geoCode_idx" ON "civic"."Politician"("geoKind", "geoCode");

-- CreateIndex
CREATE INDEX "Politician_house_idx" ON "civic"."Politician"("house");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_tvfyId_key" ON "civic"."Policy"("tvfyId");

-- CreateIndex
CREATE INDEX "PolicyPosition_policyId_idx" ON "civic"."PolicyPosition"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyPosition_politicianId_policyId_key" ON "civic"."PolicyPosition"("politicianId", "policyId");

-- AddForeignKey
ALTER TABLE "civic"."PolicyPosition" ADD CONSTRAINT "PolicyPosition_politicianId_fkey" FOREIGN KEY ("politicianId") REFERENCES "civic"."Politician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "civic"."PolicyPosition" ADD CONSTRAINT "PolicyPosition_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "civic"."Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
