-- Campaign priority rank (organiser-set; lower = higher priority, 1 = top). Additive; applied with
-- `prisma migrate deploy`. NOT NULL DEFAULT 0 leaves every existing campaign unchanged.
ALTER TABLE "canvass"."CanvassCampaign"
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
