-- New "State/Territory" geo layer for the explorer's States kind (additive;
-- applied with `prisma migrate deploy`). Derived from the already-loaded SA4
-- layer (state = leading digit of the SA4 code) so it needs no external
-- download; the geo ETL (geo:map) refreshes it alongside the address counts.

CREATE TABLE IF NOT EXISTS "geo"."state" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "geom" geometry(MultiPolygon, 4326),
    CONSTRAINT "state_pkey" PRIMARY KEY ("code")
);
CREATE INDEX IF NOT EXISTS "state_geom_gix" ON "geo"."state" USING gist (geom);

-- Populate from SA4 (idempotent; a no-op on a DB where SA4 isn't loaded yet).
DO $$
BEGIN
  IF to_regclass('geo.sa4') IS NULL THEN RETURN; END IF;

  DELETE FROM geo.state;
  INSERT INTO geo.state (code, name, geom)
  SELECT s.d,
    CASE s.d
      WHEN '1' THEN 'New South Wales'
      WHEN '2' THEN 'Victoria'
      WHEN '3' THEN 'Queensland'
      WHEN '4' THEN 'South Australia'
      WHEN '5' THEN 'Western Australia'
      WHEN '6' THEN 'Tasmania'
      WHEN '7' THEN 'Northern Territory'
      WHEN '8' THEN 'Australian Capital Territory'
      ELSE 'Other Territories'
    END,
    ST_Multi(ST_Union(s.geom))
  FROM (SELECT left(code, 1) AS d, geom FROM geo.sa4) s
  GROUP BY s.d;

  -- State address counts into the summary table the explorer reads (kind='state').
  IF to_regclass('geo.address_region') IS NOT NULL AND to_regclass('geo.region_address_count') IS NOT NULL THEN
    INSERT INTO geo.region_address_count (kind, code, address_count, updated_at)
    SELECT 'state', left(sa4_code, 1), count(*), now()
    FROM geo.address_region WHERE sa4_code IS NOT NULL GROUP BY left(sa4_code, 1)
    ON CONFLICT (kind, code) DO UPDATE
      SET address_count = EXCLUDED.address_count, updated_at = EXCLUDED.updated_at;
  END IF;
END $$;
