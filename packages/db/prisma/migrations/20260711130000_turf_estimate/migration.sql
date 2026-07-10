-- Doors-per-hour estimate, cached per turf, plus a per-disposition time allowance.
--
-- Additive and hand-written; applied with `prisma migrate deploy` (never `migrate dev`,
-- which drops the hand-maintained raw partial indexes in the geo schema).
--
-- `TurfEstimate.source` records how the walking between buildings was priced:
--   'directions' — Mapbox walked the real footpaths and crossings
--   'crowflies'  — straight lines, which always flatter a turf
-- The UI must say which. And every constant behind `doorSeconds` is a literature PRIOR
-- until canvass."DoorKnock" has rows: it carries volunteerId, dispositionCode and
-- clientCapturedAt, so consecutive knocks by one volunteer will one day give the real
-- seconds per door and the real seconds of walking. It has none today.

ALTER TABLE canvass."DispositionDef"
  ADD COLUMN IF NOT EXISTS "expectedSeconds" INTEGER;

COMMENT ON COLUMN canvass."DispositionDef"."expectedSeconds" IS
  'Seconds this outcome takes at the door. A prior until DoorKnock has rows.';

CREATE TABLE IF NOT EXISTS canvass."TurfEstimate" (
  "id"                  TEXT PRIMARY KEY,
  "turfId"              TEXT NOT NULL,
  "tenantId"            TEXT NOT NULL,
  "doors"               INTEGER NOT NULL,
  "buildings"           INTEGER NOT NULL,
  "doorsPerBuilding"    DOUBLE PRECISION NOT NULL,
  "reachableDoors"      DOUBLE PRECISION NOT NULL,
  "walkSeconds"         DOUBLE PRECISION NOT NULL,
  "approachWalkSeconds" DOUBLE PRECISION NOT NULL,
  "entrySeconds"        DOUBLE PRECISION NOT NULL,
  "doorSeconds"         DOUBLE PRECISION NOT NULL,
  "totalSeconds"        DOUBLE PRECISION NOT NULL,
  "doorsPerHour"        DOUBLE PRECISION NOT NULL,
  "doorsPerShift"       INTEGER NOT NULL,
  "shifts"              DOUBLE PRECISION NOT NULL,
  "source"              TEXT NOT NULL,
  "requests"            INTEGER NOT NULL DEFAULT 0,
  "geometryHash"        TEXT NOT NULL,
  "computedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One estimate per turf; a re-cut replaces it rather than accumulating stale rows.
CREATE UNIQUE INDEX IF NOT EXISTS "TurfEstimate_turfId_key" ON canvass."TurfEstimate"("turfId");
CREATE INDEX IF NOT EXISTS "TurfEstimate_tenantId_idx" ON canvass."TurfEstimate"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TurfEstimate_turfId_fkey') THEN
    ALTER TABLE canvass."TurfEstimate"
      ADD CONSTRAINT "TurfEstimate_turfId_fkey"
      FOREIGN KEY ("turfId") REFERENCES canvass."Turf"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TurfEstimate_tenantId_fkey') THEN
    ALTER TABLE canvass."TurfEstimate"
      ADD CONSTRAINT "TurfEstimate_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES tenant."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
