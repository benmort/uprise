-- Actions domain: public action pages, first type CLICK_TO_CALL. The page owns
-- presentation + public-surface policy; all telephony lives on the autodialer
-- campaign it references id-only. Additive, hand-written (migrate deploy).

CREATE SCHEMA IF NOT EXISTS "actions";

CREATE TYPE "actions"."ActionPageType" AS ENUM ('CLICK_TO_CALL');
CREATE TYPE "actions"."ActionPageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "actions"."ActionPage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "actions"."ActionPageType" NOT NULL DEFAULT 'CLICK_TO_CALL',
    "status" "actions"."ActionPageStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "publicSlug" TEXT NOT NULL,
    "headline" TEXT,
    "body" TEXT,
    "ctaLabel" TEXT,
    "successMessage" TEXT,
    "collectName" BOOLEAN NOT NULL DEFAULT true,
    "collectEmail" BOOLEAN NOT NULL DEFAULT true,
    "collectPhone" BOOLEAN NOT NULL DEFAULT false,
    "allowPrefill" BOOLEAN NOT NULL DEFAULT true,
    "requireCaptcha" BOOLEAN NOT NULL DEFAULT false,
    "embedDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "campaignId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionPage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActionPage_publicSlug_key" ON "actions"."ActionPage"("publicSlug");
CREATE INDEX "ActionPage_tenantId_status_idx" ON "actions"."ActionPage"("tenantId", "status");
CREATE INDEX "ActionPage_tenantId_campaignId_idx" ON "actions"."ActionPage"("tenantId", "campaignId");
