-- Campaign outreach medium (door / SMS / both). Additive; applied with
-- `prisma migrate deploy`. The EngagementChannel enum already exists in the
-- canvass schema. Default BOTH so existing campaigns are unchanged.
ALTER TABLE "canvass"."CanvassCampaign"
  ADD COLUMN "channel" "canvass"."EngagementChannel" NOT NULL DEFAULT 'BOTH';
