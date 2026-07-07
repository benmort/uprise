-- Split "Other Territories" (ASGS state digit 9) into its four constituent
-- territories — Christmas Is., Cocos (Keeling), Jervis Bay, Norfolk Is. — so each
-- is a separately selectable state in the explorer's States kind, rather than one
-- lumped row. They are ONE ASGS SA4 (901) but distinct SA3s (90101–90104), so an
-- Other-Territories address/area's state code is its SA3 code; the eight states +
-- NT/ACT keep their single leading-digit code. Additive + idempotent (re-derives
-- the geo.state layer + its address counts); the geo:map ETL applies the same
-- split on every re-ingest. Applied with `prisma migrate deploy` (never
-- `migrate dev`). No schema change — geo.state.code is already TEXT.

DO $$
BEGIN
  IF to_regclass('geo.sa4') IS NULL THEN RETURN; END IF;

  DELETE FROM geo.state;

  -- Eight states + NT/ACT: union SA4s by leading state digit (exclude digit 9).
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
      ELSE 'State ' || s.d
    END,
    ST_Multi(ST_Union(s.geom))
  FROM (SELECT left(code, 1) AS d, geom FROM geo.sa4 WHERE left(code, 1) <> '9') s
  GROUP BY s.d;

  -- Other Territories: one SA3 per territory → one state row each (code = SA3 code).
  IF to_regclass('geo.sa3') IS NOT NULL THEN
    INSERT INTO geo.state (code, name, geom)
    SELECT code, COALESCE(name, code), ST_Multi(ST_Union(geom))
    FROM geo.sa3 WHERE left(code, 1) = '9' GROUP BY code, name;
  END IF;

  -- Rebuild the state address counts with the same split (SA3 code for OT).
  IF to_regclass('geo.address_region') IS NOT NULL AND to_regclass('geo.region_address_count') IS NOT NULL THEN
    DELETE FROM geo.region_address_count WHERE kind = 'state';
    INSERT INTO geo.region_address_count (kind, code, address_count, updated_at)
    SELECT 'state',
           CASE WHEN left(sa4_code, 1) = '9' THEN sa3_code ELSE left(sa4_code, 1) END,
           count(*), now()
    FROM geo.address_region
    WHERE sa4_code IS NOT NULL
      AND (CASE WHEN left(sa4_code, 1) = '9' THEN sa3_code ELSE left(sa4_code, 1) END) IS NOT NULL
    GROUP BY 2
    ON CONFLICT (kind, code) DO UPDATE
      SET address_count = EXCLUDED.address_count, updated_at = EXCLUDED.updated_at;
  END IF;

  -- Refresh the dataset row count (now the split territories, not one OT row).
  IF to_regclass('geo.dataset_meta') IS NOT NULL THEN
    UPDATE geo.dataset_meta SET row_count = (SELECT count(*) FROM geo.state), updated_at = now()
    WHERE key = 'state';
  END IF;
END $$;
