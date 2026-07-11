-- Generalize civic.Politician from federal-only (REPS/SENATE) to jurisdiction + chamber,
-- so state MPs (from Wikidata) sit alongside federal MPs (from They Vote For You).
-- Additive + backfill; applied with `prisma migrate deploy` (never `migrate dev`).

-- CreateEnum
CREATE TYPE "civic"."Chamber" AS ENUM ('LOWER', 'UPPER');

-- AlterTable: relax federal-only keys, add the general axis
ALTER TABLE "civic"."Politician"
  ALTER COLUMN "tvfyId" DROP NOT NULL,
  ALTER COLUMN "house" DROP NOT NULL,
  ADD COLUMN "wikidataId" TEXT,
  ADD COLUMN "jurisdiction" TEXT NOT NULL DEFAULT 'FEDERAL',
  ADD COLUMN "chamber" "civic"."Chamber";

-- Backfill chamber from the federal house (existing rows are all FEDERAL via the default).
UPDATE "civic"."Politician"
  SET "chamber" = CASE "house"
    WHEN 'REPS' THEN 'LOWER'::"civic"."Chamber"
    WHEN 'SENATE' THEN 'UPPER'::"civic"."Chamber"
  END
  WHERE "chamber" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Politician_wikidataId_key" ON "civic"."Politician"("wikidataId");

-- Swap the house index for the general (jurisdiction, chamber) one.
DROP INDEX "civic"."Politician_house_idx";
CREATE INDEX "Politician_jurisdiction_chamber_idx" ON "civic"."Politician"("jurisdiction", "chamber");

-- Distinguish the two syncs' runs.
ALTER TABLE "civic"."CivicSyncRun" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'tvfy';
