-- Area (km²) per region, so address density is a division rather than a spatial scan.
--
-- geo.* is raw PostGIS and absent from schema.prisma, so this is hand-written and
-- additive; applied with `prisma migrate deploy` (never `migrate dev`, which drops the
-- hand-maintained raw partial indexes elsewhere in this schema).
--
-- Deliberately NULLable and deliberately not backfilled here. `geo:density` fills it in
-- seconds (ST_Area over all 61,811 SA1 polygons measures 2.5s), and until it runs the
-- density reads as "no data" rather than as a wrong number: density is
--   address_count / NULLIF(area_km2, 0)
-- so a missing area yields NULL, never zero and never a bogus figure. `address_count`
-- keeps standing on its own. This is the chambers lesson — the two halves of a derived
-- number must degrade together, or the layer lies.

ALTER TABLE geo.region_address_count
  ADD COLUMN IF NOT EXISTS area_km2 DOUBLE PRECISION;

COMMENT ON COLUMN geo.region_address_count.area_km2 IS
  'Region area in km², ST_Area(geom::geography)/1e6. Filled by geo:density. NULL until then.';
