-- Campaign geographic boundary (cached GeoJSON union) + re-editable source list, and the
-- volunteer self-serve turf switch + allowed modes. Additive; apply with `migrate deploy`.
ALTER TABLE "canvass"."CanvassCampaign"
  ADD COLUMN "boundary" JSONB,
  ADD COLUMN "boundarySources" JSONB,
  ADD COLUMN "volunteerCanSelfClaimTurf" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "selfClaimModes" JSONB;
