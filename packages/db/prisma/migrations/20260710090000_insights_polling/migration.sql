-- Insights / Polling domain: public-opinion polls attached to geo regions.
-- Tenant-owned + shareable (nullable tenantId — owned when set, a shared/global tier
-- when null, mirroring tenant.FeatureFlagOverride). Estimates reference geo regions
-- id-only by (geoKind, geoCode); geo.* is raw PostGIS, not a Prisma schema, so there
-- is no FK to a region. See docs/insights/vic-treaty-poll-2026.md.
--
-- Additive; applied with `prisma migrate deploy` (never `migrate dev` — that would drop
-- the raw canvass.turf_geom_gix / partial-unique indexes Prisma doesn't model). The two
-- partial-unique slug indexes below are hand-written (Prisma can't express the WHERE).

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "insights";

-- CreateEnum
CREATE TYPE "insights"."PollStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "insights"."Poll" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "commissioner" TEXT,
    "fieldworkStart" TIMESTAMP(3),
    "fieldworkEnd" TIMESTAMP(3),
    "sampleSize" INTEGER,
    "methodology" TEXT,
    "geoScope" TEXT,
    "weighted" BOOLEAN NOT NULL DEFAULT true,
    "licence" TEXT,
    "attribution" TEXT,
    "keyFindings" JSONB,
    "status" "insights"."PollStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "sourceFileName" TEXT,
    "sourceFileHash" TEXT,
    "lastIngestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights"."PollQuestion" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "sheet" TEXT,
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    "hasNet" BOOLEAN NOT NULL DEFAULT false,
    "responseKind" TEXT,

    CONSTRAINT "PollQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights"."PollEstimate" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "tenantId" TEXT,
    "responseLabel" TEXT NOT NULL,
    "responseOrdinal" INTEGER NOT NULL DEFAULT 0,
    "isNet" BOOLEAN NOT NULL DEFAULT false,
    "breakdownGroup" TEXT NOT NULL,
    "breakdownValue" TEXT NOT NULL,
    "geoKind" TEXT,
    "geoCode" TEXT,
    "percent" DECIMAL(5,2),
    "baseN" INTEGER,
    "reportable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PollEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Poll_tenantId_status_idx" ON "insights"."Poll"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PollQuestion_pollId_ordinal_idx" ON "insights"."PollQuestion"("pollId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "PollQuestion_pollId_code_key" ON "insights"."PollQuestion"("pollId", "code");

-- CreateIndex
CREATE INDEX "PollEstimate_pollId_geoKind_geoCode_idx" ON "insights"."PollEstimate"("pollId", "geoKind", "geoCode");

-- CreateIndex
CREATE INDEX "PollEstimate_questionId_breakdownGroup_idx" ON "insights"."PollEstimate"("questionId", "breakdownGroup");

-- CreateIndex
CREATE INDEX "PollEstimate_tenantId_idx" ON "insights"."PollEstimate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PollEstimate_questionId_responseLabel_breakdownGroup_breakd_key" ON "insights"."PollEstimate"("questionId", "responseLabel", "breakdownGroup", "breakdownValue");

-- Partial-unique slug indexes for the shareable tier (hand-written — Prisma can't
-- express the WHERE): a slug is unique per tenant, and unique among global polls.
CREATE UNIQUE INDEX "Poll_tenant_slug_uq" ON "insights"."Poll"("tenantId", "slug") WHERE "tenantId" IS NOT NULL;
CREATE UNIQUE INDEX "Poll_global_slug_uq" ON "insights"."Poll"("slug") WHERE "tenantId" IS NULL;

-- AddForeignKey
ALTER TABLE "insights"."Poll" ADD CONSTRAINT "Poll_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights"."PollQuestion" ADD CONSTRAINT "PollQuestion_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "insights"."Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights"."PollEstimate" ADD CONSTRAINT "PollEstimate_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "insights"."Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights"."PollEstimate" ADD CONSTRAINT "PollEstimate_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "insights"."PollQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
