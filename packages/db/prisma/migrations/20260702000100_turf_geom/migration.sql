-- PostGIS mirror of Turf.geometry (GeoJSON) for server-side spatial ops (boundary clip,
-- non-overlap subtract, point-in-turf). GIST-indexed. Backfilled per-row so one invalid
-- geometry can't block the whole migration. Additive; apply with `migrate deploy`.
ALTER TABLE "canvass"."Turf" ADD COLUMN "geom" geometry(MultiPolygon, 4326);

CREATE INDEX IF NOT EXISTS "turf_geom_gix" ON "canvass"."Turf" USING GIST ("geom");

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT "id", "geometry" FROM "canvass"."Turf" WHERE "geometry" IS NOT NULL LOOP
    BEGIN
      UPDATE "canvass"."Turf"
        SET "geom" = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(r."geometry"::text), 4326))
        WHERE "id" = r."id";
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Turf % geom backfill skipped: %', r."id", SQLERRM;
    END;
  END LOOP;
END $$;
