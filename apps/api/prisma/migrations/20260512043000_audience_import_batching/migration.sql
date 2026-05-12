-- Add resumable background import state for AudienceImport jobs.
CREATE TYPE "AudienceImportStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "AudienceImport"
ADD COLUMN "status" "AudienceImportStatus" NOT NULL DEFAULT 'QUEUED',
ADD COLUMN "cursor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "csvRaw" TEXT NOT NULL DEFAULT '',
ADD COLUMN "errorSummary" TEXT,
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing historical imports should not be re-dispatched.
UPDATE "AudienceImport"
SET
  "status" = 'SUCCEEDED',
  "cursor" = "totalRows",
  "startedAt" = COALESCE("startedAt", "createdAt"),
  "completedAt" = COALESCE("completedAt", "createdAt");

ALTER TABLE "AudienceImport" ALTER COLUMN "csvRaw" DROP DEFAULT;

CREATE INDEX "AudienceImport_organizationId_status_createdAt_idx"
ON "AudienceImport"("organizationId", "status", "createdAt");
