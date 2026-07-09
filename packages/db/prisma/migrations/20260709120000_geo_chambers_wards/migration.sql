-- Chamber-aware geo layer: upper/lower house across every level of government, plus
-- the local-government ward layer. Additive and idempotent; applied with
-- `prisma migrate deploy` (never `migrate dev` — it drops the hand-maintained raw indexes).
--
-- `geo` is a raw-SQL/PostGIS schema and is absent from `datasource.schemas`, so nothing
-- here has a matching model in schema.prisma. Follows the derived-layer precedent set by
-- 20260704140000_geo_state_layer.
--
-- Key fact this migration exploits: ABS encodes the upper-house division in the
-- parenthetical of `geo.sed.name`, for exactly the two states that have distinct
-- upper-house boundaries.
--   Victoria  "Albert Park (Southern Metropolitan)"  → LA district (Legislative Council region)
--   Tasmania  "Bass (Launceston)"                    → HoA division (Legislative Council division)
-- So both chambers are derivable from data already loaded — no VEC/TEC download.
-- Every other jurisdiction has unparenthesised names; the sole other parenthesised row
-- nationally is "Unclassified (OT)" in Other Territories, which is excluded throughout.

-- ── Chamber catalogue ───────────────────────────────────────────────────────
-- Carries what a geometry table structurally cannot: that Queensland, the ACT and the NT
-- have NO upper house, that local councils are unicameral, and which layer sources each
-- chamber's electorates. No geometry. ("exists" is Postgres catcode C — safe as a column.)
CREATE TABLE IF NOT EXISTS "geo"."chamber" (
  "key"                  TEXT PRIMARY KEY,
  "jurisdiction"         TEXT NOT NULL,
  "level"                TEXT NOT NULL,            -- federal | state | local
  "chamber"              TEXT NOT NULL,            -- lower | upper | unicameral
  "name"                 TEXT NOT NULL,
  "exists"               BOOLEAN NOT NULL DEFAULT true,
  "electorate_layer"     TEXT,                     -- ced | sed_lower | sed_upper | chamber_electorate | lga
  "sub_electorate_layer" TEXT,                     -- local only: ward
  "member_count"         INTEGER,                  -- members per electorate
  "note"                 TEXT
);

-- ── Derived chamber-pure state layers ───────────────────────────────────────
-- `state` carries the FULL name ('Victoria'), because listDivisions selects d.state and
-- regionChildren filters `WHERE d.state = region.name` against geo.state.name.
CREATE TABLE IF NOT EXISTS "geo"."sed_lower" (
  "code"              TEXT PRIMARY KEY,
  "name"              TEXT,
  "state"             TEXT,
  -- The sed_upper region this district nests inside. Set for Victoria (a Legislative
  -- Council region is exactly 11 Assembly districts); NULL for Tasmania, whose two
  -- chambers CROSS-CUT each other, and NULL for the unicameral-boundaried jurisdictions.
  "parent_upper_code" TEXT,
  "geom"              geometry(MultiPolygon, 4326)
);
CREATE TABLE IF NOT EXISTS "geo"."sed_upper" (
  "code"  TEXT PRIMARY KEY,
  "name"  TEXT,
  "state" TEXT,
  "geom"  geometry(MultiPolygon, 4326)
);
CREATE INDEX IF NOT EXISTS "sed_lower_geom_gix"   ON "geo"."sed_lower" USING gist ("geom");
CREATE INDEX IF NOT EXISTS "sed_upper_geom_gix"   ON "geo"."sed_upper" USING gist ("geom");
CREATE INDEX IF NOT EXISTS "sed_lower_parent_idx" ON "geo"."sed_lower" ("parent_upper_code");

-- ── sed → chamber crosswalk ─────────────────────────────────────────────────
-- The cheap per-address key: every ABS sed row maps deterministically to its lower and
-- upper cell by name, so attributing 16.9M addresses is a 432-row join, not a spatial one.
CREATE TABLE IF NOT EXISTS "geo"."sed_chamber_xwalk" (
  "sed_code"       TEXT PRIMARY KEY,
  "sed_lower_code" TEXT,
  "sed_upper_code" TEXT
);

-- ── State-wide chamber electorates ──────────────────────────────────────────
-- The Senate and the NSW/SA/WA Legislative Councils have no sub-state boundaries — the
-- electorate IS the jurisdiction. Materialised (not a view over geo.state) because the
-- Senate's electorate set is NOT 1:1 with geo.state: Christmas Is. + Cocos vote in the NT
-- contest, Jervis Bay + Norfolk Is. in the ACT contest, so 12 state rows collapse to 8.
CREATE TABLE IF NOT EXISTS "geo"."chamber_electorate" (
  "code"         TEXT PRIMARY KEY,
  "chamber_key"  TEXT NOT NULL,          -- id-only ref → geo.chamber.key
  "name"         TEXT NOT NULL,
  "state"        TEXT,
  "state_codes"  TEXT[] NOT NULL,        -- geo.state.code(s) this electorate unions
  "member_count" INTEGER,
  "geom"         geometry(MultiPolygon, 4326)
);
CREATE INDEX IF NOT EXISTS "chamber_electorate_geom_gix" ON "geo"."chamber_electorate" USING gist ("geom");

-- ── Local-government wards ──────────────────────────────────────────────────
-- Sub-division of a (unicameral) council. No national dataset exists — loaded per state by
-- the ETL, so coverage is partial by design. Undivided councils simply have no ward rows.
-- Tasmanian councils are undivided; the ACT has no local government at all.
CREATE TABLE IF NOT EXISTS "geo"."ward" (
  -- Synthetic key, built by the loader as '<lga_code>-W-<SLUG(ward name)>' (e.g.
  -- '20110-W-NORTH'). There is no national ward-code standard, so a source that renames a
  -- ward re-keys it — the most fragile identifier in this schema. LGA codes are
  -- state-digit-prefixed, so ward codes inherit that invariant (the admin map relies on it).
  "code"     TEXT PRIMARY KEY,
  "name"     TEXT,
  "lga_code" TEXT,               -- id-only ref → geo.lga.code
  "state"    TEXT,
  "geom"     geometry(MultiPolygon, 4326)
);
CREATE INDEX IF NOT EXISTS "ward_geom_gix" ON "geo"."ward" USING gist ("geom");
CREATE INDEX IF NOT EXISTS "ward_lga_idx"  ON "geo"."ward" ("lga_code");

-- ── Per-address chamber columns ─────────────────────────────────────────────
-- Nullable, no default → metadata-only on PG11+, instant even at 16.9M rows. They are
-- backfilled further down, BEFORE the indexes are built (see the backfill block).
-- No senate_code/lc_code column: an address's state-wide chamber is fully determined by
-- its state, already derivable from sa4_code (see the CASE in map.ts / geo.service.ts).
ALTER TABLE "geo"."address_region" ADD COLUMN IF NOT EXISTS "sed_lower_code" TEXT;
ALTER TABLE "geo"."address_region" ADD COLUMN IF NOT EXISTS "sed_upper_code" TEXT;
ALTER TABLE "geo"."address_region" ADD COLUMN IF NOT EXISTS "ward_code"      TEXT;

-- ── Derive the chamber-pure layers from geo.sed ─────────────────────────────
-- Gated on STATE NAME, never on the mere presence of parentheses: "Unclassified (OT)" is
-- parenthesised and must not be read as a Legislative Council region.
--
-- Derived codes are slugs PREFIXED WITH THE ASGS STATE DIGIT ('2-LC-…' for Victoria,
-- '6-HA-…' for Tasmania). That is load-bearing, not cosmetic: every geo layer's code
-- starts with its state digit, and the admin map relies on it — geo-surface.tsx filters
-- tiles with `slice(code, 0, 1) == stateDigit` and frames the viewport from `code[0]`.
-- A bare 'VIC-LC-…' slug would silently break the state filter on exactly these layers.
-- Victoria's lower rows and the six pass-through jurisdictions reuse the ABS code
-- verbatim, so `sed_lower_code == sed_code` there and saved boundarySources still resolve.
DO $mig$
BEGIN
  IF to_regclass('geo.sed') IS NULL THEN RETURN; END IF;

  DELETE FROM geo.sed_upper;
  DELETE FROM geo.sed_lower;
  DELETE FROM geo.sed_chamber_xwalk;

  -- Victoria upper: dissolve the 88 Assembly districts on their Council region → 8 rows.
  INSERT INTO geo.sed_upper (code, name, state, geom)
  SELECT '2-LC-' || upper(regexp_replace(region, '[^A-Za-z0-9]+', '-', 'g')),
         region, 'Victoria', ST_Multi(ST_Union(geom))
  FROM (SELECT substring(name from '\(([^)]*)\)$') AS region, geom
          FROM geo.sed WHERE state = 'Victoria') v
  GROUP BY region;

  -- Tasmania upper: dissolve the 22 grid cells on their Council division → 15 rows.
  INSERT INTO geo.sed_upper (code, name, state, geom)
  SELECT '6-LC-' || upper(regexp_replace(lc, '[^A-Za-z0-9]+', '-', 'g')),
         lc, 'Tasmania', ST_Multi(ST_Union(geom))
  FROM (SELECT substring(name from '\(([^)]*)\)$') AS lc, geom
          FROM geo.sed WHERE state = 'Tasmania') t
  GROUP BY lc;

  -- Victoria lower: each ABS row already IS an Assembly district. Keep the ABS code (so
  -- saved boundarySources of type "sed" still resolve), strip the region from the name,
  -- and record the nesting edge.
  INSERT INTO geo.sed_lower (code, name, state, parent_upper_code, geom)
  SELECT code,
         btrim(split_part(name, ' (', 1)),
         'Victoria',
         '2-LC-' || upper(regexp_replace(substring(name from '\(([^)]*)\)$'), '[^A-Za-z0-9]+', '-', 'g')),
         geom
  FROM geo.sed WHERE state = 'Victoria';

  -- Tasmania lower: dissolve the grid cells on their House of Assembly division → 5 rows.
  -- parent_upper_code stays NULL: HoA and LC divisions cross-cut, which is precisely why
  -- ABS ships intersection cells in the first place.
  INSERT INTO geo.sed_lower (code, name, state, parent_upper_code, geom)
  SELECT '6-HA-' || upper(regexp_replace(div, '[^A-Za-z0-9]+', '-', 'g')),
         div, 'Tasmania', NULL, ST_Multi(ST_Union(geom))
  FROM (SELECT btrim(split_part(name, ' (', 1)) AS div, geom
          FROM geo.sed WHERE state = 'Tasmania') t
  GROUP BY div;

  -- Pass-through: the six jurisdictions whose ABS rows are already single-chamber
  -- districts. Codes and names are reused verbatim.
  INSERT INTO geo.sed_lower (code, name, state, parent_upper_code, geom)
  SELECT code, name, state, NULL, geom
  FROM geo.sed
  WHERE state IN ('New South Wales', 'Queensland', 'South Australia',
                  'Western Australia', 'Australian Capital Territory', 'Northern Territory');

  -- Crosswalk: one row per ABS sed row (Other Territories excluded).
  INSERT INTO geo.sed_chamber_xwalk (sed_code, sed_lower_code, sed_upper_code)
  SELECT s.code,
         CASE WHEN s.state = 'Tasmania'
              THEN '6-HA-' || upper(regexp_replace(btrim(split_part(s.name, ' (', 1)), '[^A-Za-z0-9]+', '-', 'g'))
              ELSE s.code
         END,
         CASE WHEN s.state = 'Victoria'
              THEN '2-LC-' || upper(regexp_replace(substring(s.name from '\(([^)]*)\)$'), '[^A-Za-z0-9]+', '-', 'g'))
              WHEN s.state = 'Tasmania'
              THEN '6-LC-' || upper(regexp_replace(substring(s.name from '\(([^)]*)\)$'), '[^A-Za-z0-9]+', '-', 'g'))
              ELSE NULL
         END
  FROM geo.sed s
  WHERE s.state <> 'Other Territories';
END $mig$;

-- ── State-wide chamber electorates (Senate + NSW/SA/WA Legislative Councils) ─
DO $mig$
BEGIN
  IF to_regclass('geo.state') IS NULL THEN RETURN; END IF;

  DELETE FROM geo.chamber_electorate;
  INSERT INTO geo.chamber_electorate (code, chamber_key, name, state, state_codes, member_count) VALUES
    ('SENATE-NSW', 'fed-senate', 'Senate – New South Wales',              'New South Wales',              ARRAY['1'], 12),
    ('SENATE-VIC', 'fed-senate', 'Senate – Victoria',                     'Victoria',                     ARRAY['2'], 12),
    ('SENATE-QLD', 'fed-senate', 'Senate – Queensland',                   'Queensland',                   ARRAY['3'], 12),
    ('SENATE-SA',  'fed-senate', 'Senate – South Australia',              'South Australia',              ARRAY['4'], 12),
    ('SENATE-WA',  'fed-senate', 'Senate – Western Australia',            'Western Australia',            ARRAY['5'], 12),
    ('SENATE-TAS', 'fed-senate', 'Senate – Tasmania',                     'Tasmania',                     ARRAY['6'], 12),
    -- Christmas Is. (90101) and Cocos (Keeling) (90102) vote in the NT Senate contest.
    ('SENATE-NT',  'fed-senate', 'Senate – Northern Territory',           'Northern Territory',           ARRAY['7','90101','90102'], 2),
    -- Jervis Bay (90103) and Norfolk Is. (90104) vote in the ACT Senate contest.
    ('SENATE-ACT', 'fed-senate', 'Senate – Australian Capital Territory', 'Australian Capital Territory', ARRAY['8','90103','90104'], 2),
    ('NSW-LC', 'nsw-lc', 'New South Wales Legislative Council',   'New South Wales',   ARRAY['1'], 42),
    ('SA-LC',  'sa-lc',  'South Australia Legislative Council',   'South Australia',   ARRAY['4'], 22),
    ('WA-LC',  'wa-lc',  'Western Australia Legislative Council', 'Western Australia', ARRAY['5'], 37);

  UPDATE geo.chamber_electorate ce
     SET geom = sub.geom
    FROM (SELECT ce2.code AS code, ST_Multi(ST_Union(s.geom)) AS geom
            FROM geo.chamber_electorate ce2
            JOIN geo.state s ON s.code = ANY (ce2.state_codes)
           GROUP BY ce2.code) sub
   WHERE sub.code = ce.code;
END $mig$;

-- ── The catalogue itself ────────────────────────────────────────────────────
-- `chamber` is the constitutional status, not the layer: Queensland, the ACT and the NT
-- have a single house, so their Assembly is 'unicameral' rather than 'lower' — even though
-- its electorates live in the sed_lower layer alongside the true lower houses.
INSERT INTO "geo"."chamber" ("key","jurisdiction","level","chamber","name","exists","electorate_layer","sub_electorate_layer","member_count","note") VALUES
  ('fed-hor',    'Federal', 'federal', 'lower',      'House of Representatives', true,  'ced',                NULL,   1,    NULL),
  ('fed-senate', 'Federal', 'federal', 'upper',      'Senate',                   true,  'chamber_electorate', NULL,   NULL, 'State-wide. 12 senators per state; 2 each for the ACT and NT'),

  ('nsw-la', 'New South Wales', 'state', 'lower',      'Legislative Assembly', true,  'sed_lower',          NULL, 1,    NULL),
  ('nsw-lc', 'New South Wales', 'state', 'upper',      'Legislative Council',  true,  'chamber_electorate', NULL, 42,   'A single state-wide electorate'),
  ('vic-la', 'Victoria',        'state', 'lower',      'Legislative Assembly', true,  'sed_lower',          NULL, 1,    NULL),
  ('vic-lc', 'Victoria',        'state', 'upper',      'Legislative Council',  true,  'sed_upper',          NULL, 5,    'Eight regions, each exactly 11 Assembly districts'),
  ('qld-la', 'Queensland',      'state', 'unicameral', 'Legislative Assembly', true,  'sed_lower',          NULL, 1,    NULL),
  ('qld-lc', 'Queensland',      'state', 'upper',      'Legislative Council',  false, NULL,                 NULL, NULL, 'Abolished in 1922 – Queensland is unicameral'),
  ('wa-la',  'Western Australia','state','lower',      'Legislative Assembly', true,  'sed_lower',          NULL, 1,    NULL),
  ('wa-lc',  'Western Australia','state','upper',      'Legislative Council',  true,  'chamber_electorate', NULL, 37,   'A single state-wide electorate since the 2021 reform, first used at the 2025 election'),
  ('sa-ha',  'South Australia', 'state', 'lower',      'House of Assembly',    true,  'sed_lower',          NULL, 1,    NULL),
  ('sa-lc',  'South Australia', 'state', 'upper',      'Legislative Council',  true,  'chamber_electorate', NULL, 22,   'A single state-wide electorate'),
  ('tas-ha', 'Tasmania',        'state', 'lower',      'House of Assembly',    true,  'sed_lower',          NULL, 7,    'Five multi-member divisions, 7 members each'),
  ('tas-lc', 'Tasmania',        'state', 'upper',      'Legislative Council',  true,  'sed_upper',          NULL, 1,    'Fifteen single-member divisions that cross-cut the Assembly divisions'),
  ('act-la', 'Australian Capital Territory', 'state', 'unicameral', 'Legislative Assembly', true,  'sed_lower', NULL, 5,    NULL),
  ('act-lc', 'Australian Capital Territory', 'state', 'upper',      'Legislative Council',  false, NULL,        NULL, NULL, 'The ACT is unicameral'),
  ('nt-la',  'Northern Territory',           'state', 'unicameral', 'Legislative Assembly', true,  'sed_lower', NULL, 1,    NULL),
  ('nt-lc',  'Northern Territory',           'state', 'upper',      'Legislative Council',  false, NULL,        NULL, NULL, 'The NT is unicameral'),

  ('local-council', 'All states', 'local', 'unicameral', 'Council',             true,  'lga', 'ward', NULL, 'Councillors are elected by ward where a council is divided, otherwise at large across the whole LGA. Tasmanian councils are undivided'),
  ('local-upper',   'All states', 'local', 'upper',      'Legislative Council', false, NULL,  NULL,   NULL, 'Local councils are unicameral'),
  ('act-local',     'Australian Capital Territory', 'local', 'unicameral', 'Council', false, NULL, NULL, NULL, 'The ACT has no local government; the Legislative Assembly performs municipal functions')
ON CONFLICT ("key") DO UPDATE SET
  "jurisdiction" = EXCLUDED."jurisdiction", "level" = EXCLUDED."level", "chamber" = EXCLUDED."chamber",
  "name" = EXCLUDED."name", "exists" = EXCLUDED."exists", "electorate_layer" = EXCLUDED."electorate_layer",
  "sub_electorate_layer" = EXCLUDED."sub_electorate_layer", "member_count" = EXCLUDED."member_count",
  "note" = EXCLUDED."note";

-- Indexes on the (still-NULL) per-address chamber columns. PARTIAL, so they cost almost
-- nothing until `geo:chambers` backfills the columns; an equality lookup implies NOT NULL,
-- so the planner still uses them afterwards.
CREATE INDEX IF NOT EXISTS "address_region_sed_lower_idx"
  ON "geo"."address_region" ("sed_lower_code") WHERE "sed_lower_code" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "address_region_sed_upper_idx"
  ON "geo"."address_region" ("sed_upper_code") WHERE "sed_upper_code" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "address_region_ward_idx"
  ON "geo"."address_region" ("ward_code") WHERE "ward_code" IS NOT NULL;

-- ── Address counts ──────────────────────────────────────────────────────────
-- DELIBERATELY does NOT publish region_address_count for sed_lower/sed_upper.
--
-- Those counts could be derived right here through the crosswalk on the already-present
-- sed_code — but the per-address sed_lower_code/sed_upper_code columns would still be NULL
-- until `geo:chambers` (or a full `geo:map`) runs. divisionDetail reads addressCount from
-- this summary and contactCount from the per-address column, so publishing one without the
-- other makes the layer LIE: a Victorian seat would report its true 48,186 addresses next
-- to contactCount = 0, overstating "addresses without contacts" by every contact the org
-- actually has there. Leaving both empty degrades SYMMETRICALLY (0/0/0) — exactly how the
-- existing `state` layer behaves before the mesh-block backfill — and `geo:chambers`
-- publishes the columns and the counts together, in one transaction.
--
-- The 16.9M-row UPDATE is not run here on purpose: it takes >10 minutes under index
-- maintenance and would hold a write lock on geo.address_region for the whole deploy.
DO $mig$
BEGIN
  IF to_regclass('geo.address_region') IS NULL OR to_regclass('geo.region_address_count') IS NULL THEN RETURN; END IF;

  -- State-wide chambers key off the SAME SA4-derived state code the `state` kind and
  -- stateDetail use — including for contactCount — so this pair is already symmetric and
  -- can be published now. It yields no rows until the G-NAF mesh-block backfill has run,
  -- identical to the existing States layer. Deliberately NOT given a fallback state
  -- derivation: a second, divergent notion of "which state" could disagree with geo.state.
  IF to_regclass('geo.chamber_electorate') IS NOT NULL THEN
    INSERT INTO geo.region_address_count (kind, code, address_count, updated_at)
    SELECT 'chamber_electorate', ce.code, count(*), now()
      FROM geo.address_region ar
      JOIN geo.chamber_electorate ce
        ON (CASE WHEN left(ar.sa4_code, 1) = '9' THEN ar.sa3_code ELSE left(ar.sa4_code, 1) END) = ANY (ce.state_codes)
     WHERE ar.sa4_code IS NOT NULL
     GROUP BY ce.code
    ON CONFLICT (kind, code) DO UPDATE
      SET address_count = EXCLUDED.address_count, updated_at = EXCLUDED.updated_at;
  END IF;
END $mig$;

-- ── Dataset provenance (powers /data/datasets) ──────────────────────────────
INSERT INTO geo.dataset_meta (key, label, source_url, release_date, licence, row_count, status, last_ingested) VALUES
  ('sed_lower', 'State lower-house electorates', '(derived from ABS SED)', '2025', 'CC BY 4.0', (SELECT count(*) FROM geo.sed_lower), 'loaded', now()),
  ('sed_upper', 'State upper-house electorates', '(derived from ABS SED)', '2025', 'CC BY 4.0', (SELECT count(*) FROM geo.sed_upper), 'loaded', now()),
  ('chamber_electorate', 'State-wide chamber electorates', '(derived from geo.state)', '2025', 'CC BY 4.0', (SELECT count(*) FROM geo.chamber_electorate), 'loaded', now()),
  ('ward', 'Local-government wards', '(per-state electoral commissions)', NULL, 'CC BY 4.0', 0, 'pending', NULL)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, source_url = EXCLUDED.source_url, release_date = EXCLUDED.release_date,
  licence = EXCLUDED.licence, row_count = EXCLUDED.row_count, status = EXCLUDED.status,
  last_ingested = EXCLUDED.last_ingested, updated_at = now();
