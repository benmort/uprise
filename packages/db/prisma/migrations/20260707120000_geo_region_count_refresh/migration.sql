-- Refresh geo.region_address_count from already-loaded address data, for EVERY
-- kind incl. 'state' (additive; applied with `prisma migrate deploy`).
--
-- The earlier backfills (20260704120000 for ced/sed/lga/mb/sa1-4,
-- 20260704140000 for state) only populate the summary when they run AFTER
-- geo.address_region is loaded. On any environment whose address load post-dates
-- those migrations, the explorer's division/state counts still read 0
-- (listStates/listDivisions LEFT JOIN region_address_count and COALESCE→0).
-- This re-runs the same idempotent aggregation so a `migrate deploy` refreshes
-- the counts in place: a no-op where geo.address_region is absent or empty
-- (script-managed table – guarded), an upsert refresh where it is populated.
--
-- NB: if counts still read 0 after this deploys, geo.address_region itself is
-- empty (addresses were never mapped to regions) → run the geo ETL
-- (`geo:map` / apps/api/src/scripts/geo/load-prod.sh), not another migration.
DO $$
DECLARE
  pair RECORD;
BEGIN
  IF to_regclass('geo.address_region') IS NULL OR to_regclass('geo.region_address_count') IS NULL THEN
    RETURN;
  END IF;

  -- Column-keyed kinds (code = the region column).
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

  -- State/Territory = leading digit of the SA4 code (an expression, not a column).
  INSERT INTO geo.region_address_count (kind, code, address_count, updated_at)
  SELECT 'state', left(sa4_code, 1), count(*), now()
  FROM geo.address_region WHERE sa4_code IS NOT NULL GROUP BY left(sa4_code, 1)
  ON CONFLICT (kind, code) DO UPDATE
    SET address_count = EXCLUDED.address_count, updated_at = EXCLUDED.updated_at;
END $$;
