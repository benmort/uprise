-- Evaluation mode (randomised holdouts) + score-run provenance. Additive; applied with
-- `prisma migrate deploy`.

-- Immutable holdout assignment: { seed, icc, pairs, treatmentCodes, holdoutCodes, power, enabledAt }.
ALTER TABLE "canvass"."CanvassCampaign" ADD COLUMN IF NOT EXISTS "evaluation" JSONB;

-- Which score run ranked this walklist (frozen provenance — a join, not archaeology).
ALTER TABLE "canvass"."WalkList" ADD COLUMN IF NOT EXISTS "heatRunId" TEXT;

-- Frozen runs are pre-election snapshots kept for out-of-sample validation: recompute
-- deletes only the live (non-frozen) run, so a campaign may now hold one live run plus
-- any number of frozen ones — the unique(campaignId) constraint must relax to an index.
ALTER TABLE "canvass"."CanvassHeatRun" ADD COLUMN IF NOT EXISTS "frozen" BOOLEAN NOT NULL DEFAULT false;
DROP INDEX IF EXISTS "canvass"."CanvassHeatRun_campaignId_key";
CREATE INDEX IF NOT EXISTS "CanvassHeatRun_campaignId_idx" ON "canvass"."CanvassHeatRun"("campaignId");

-- Cells of a frozen run must survive the live run's delete-and-insert: the cell unique
-- key gains the run dimension.
DROP INDEX IF EXISTS "canvass"."CanvassHeatCell_campaignId_sa1Code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CanvassHeatCell_runId_sa1Code_key"
  ON "canvass"."CanvassHeatCell"("runId", "sa1Code");
CREATE INDEX IF NOT EXISTS "CanvassHeatCell_campaignId_idx" ON "canvass"."CanvassHeatCell"("campaignId");
