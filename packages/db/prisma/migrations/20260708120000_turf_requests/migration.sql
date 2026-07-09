-- Turf request/approval (additive; applied with `prisma migrate deploy`).
--
-- Adds a REQUESTED assignment state and a per-campaign switch that makes volunteer
-- self-claims land as requests an organiser approves (vs the existing instant
-- ASSIGNED path). REQUESTED is NOT consumed here (no default/backfill uses it), so
-- the enum ADD VALUE is safe standalone in this migration's transaction.

ALTER TYPE "canvass"."TurfAssignmentStatus" ADD VALUE IF NOT EXISTS 'REQUESTED';

ALTER TABLE "canvass"."CanvassCampaign"
  ADD COLUMN IF NOT EXISTS "turfClaimRequiresApproval" BOOLEAN NOT NULL DEFAULT false;
