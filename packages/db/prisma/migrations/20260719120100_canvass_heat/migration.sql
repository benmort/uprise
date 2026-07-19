-- Canvass targeting heat map: per-campaign cached score run + per-SA1 cells, plus the
-- campaign heatConfig column. Additive; applied with `prisma migrate deploy`.

ALTER TABLE "canvass"."CanvassCampaign" ADD COLUMN IF NOT EXISTS "heatConfig" JSONB;

CREATE TABLE IF NOT EXISTS "canvass"."CanvassHeatRun" (
  "id"         TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "inputsHash" TEXT NOT NULL,
  "preset"     TEXT NOT NULL,
  "weights"    JSONB NOT NULL,
  "meta"       JSONB NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CanvassHeatRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CanvassHeatRun_campaignId_key" ON "canvass"."CanvassHeatRun"("campaignId");
CREATE INDEX IF NOT EXISTS "CanvassHeatRun_tenantId_idx" ON "canvass"."CanvassHeatRun"("tenantId");

DO $$ BEGIN
  ALTER TABLE "canvass"."CanvassHeatRun"
    ADD CONSTRAINT "CanvassHeatRun_campaignId_fkey" FOREIGN KEY ("campaignId")
    REFERENCES "canvass"."CanvassCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "canvass"."CanvassHeatRun"
    ADD CONSTRAINT "CanvassHeatRun_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "canvass"."CanvassHeatCell" (
  "id"               TEXT NOT NULL,
  "runId"            TEXT NOT NULL,
  "campaignId"       TEXT NOT NULL,
  "sa1Code"          TEXT NOT NULL,
  "score"            DOUBLE PRECISION,
  "band"             INTEGER,
  "subScores"        JSONB NOT NULL,
  "flags"            JSONB NOT NULL,
  "coverageFraction" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "CanvassHeatCell_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CanvassHeatCell_campaignId_sa1Code_key"
  ON "canvass"."CanvassHeatCell"("campaignId", "sa1Code");
CREATE INDEX IF NOT EXISTS "CanvassHeatCell_runId_idx" ON "canvass"."CanvassHeatCell"("runId");

DO $$ BEGIN
  ALTER TABLE "canvass"."CanvassHeatCell"
    ADD CONSTRAINT "CanvassHeatCell_runId_fkey" FOREIGN KEY ("runId")
    REFERENCES "canvass"."CanvassHeatRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
