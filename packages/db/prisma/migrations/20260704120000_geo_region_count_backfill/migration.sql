-- Backfill geo.region_address_count from already-loaded address data
-- (additive; applied with `prisma migrate deploy`).
--
-- 20260704090000_geo_perf created the table EMPTY and relied on the next
-- geo:map run to populate it – on any DB whose addresses were loaded before
-- that migration, every division/area count would read 0 until the ETL reran.
-- This backfills in place: a no-op on DBs with no geo load (address_region is
-- script-managed and may not exist yet – guarded), an idempotent refresh where
-- the ETL has already populated the summary.
DO $$
DECLARE
  pair RECORD;
BEGIN
  IF to_regclass('geo.address_region') IS NULL OR to_regclass('geo.region_address_count') IS NULL THEN
    RETURN;
  END IF;
  FOR pair IN
    SELECT * FROM (VALUES
      ('ced', 'ced_code'),
      ('sed', 'sed_code'),
      ('lga', 'lga_code'),
      ('mb',  'mb_code'),
      ('sa1', 'sa1_code'),
      ('sa2', 'sa2_code'),
      ('sa3', 'sa3_code'),
      ('sa4', 'sa4_code')
    ) AS t(kind, col)
  LOOP
    EXECUTE format(
      'INSERT INTO geo.region_address_count (kind, code, address_count, updated_at)
       SELECT %L, %I, COUNT(*), now() FROM geo.address_region
       WHERE %I IS NOT NULL GROUP BY %I
       ON CONFLICT (kind, code) DO UPDATE
         SET address_count = EXCLUDED.address_count, updated_at = EXCLUDED.updated_at',
      pair.kind, pair.col, pair.col, pair.col
    );
  END LOOP;
END $$;
