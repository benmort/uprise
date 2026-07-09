-- First Nations geography: the ABS ASGS Indigenous Structure as a REFERENCE-ONLY geo layer.
-- Additive and idempotent; applied with `prisma migrate deploy` (never `migrate dev`).
--
-- `geo` is a raw-SQL/PostGIS schema and is absent from `datasource.schemas`, so nothing here
-- has a matching model in schema.prisma. Follows the shape of 20260709120000_geo_chambers_wards.
--
-- Three levels, three tables — mirroring geo.sa1..geo.sa4, because the whole read path
-- (TILE_SOURCE, the generic tile()/detail SQL) keys off one {table, codeCol} per layer:
--   geo.ireg  Indigenous Regions    (40 real)
--   geo.iare  Indigenous Areas      (412 real)
--   geo.iloc  Indigenous Locations  (1,120 real)
--
-- REFERENCE-ONLY. These layers are deliberately absent from DivisionType, DIVISION_TABLE,
-- TURF_DIVISION_TYPES and UNION_SOURCES in geo.service.ts: an organiser must not be able to
-- cut a doorknocking turf from an Indigenous Area. A unit test pins that guarantee.
--
-- Two traps this schema is shaped around, both confirmed against the live ABS FeatureServer:
--
--  1. Each level carries exactly 19 NON-SPATIAL pseudo-rows: every jurisdiction has an
--     `x94 "No usual address"` and an `x97 "Migratory - Offshore - Shipping"`, plus one
--     `ZZZ "Outside Australia"`. They have NULL geometry. The loader excludes them on
--     `geometry IS NOT NULL` — never on a code prefix, which would catch only ZZZ and leave
--     18 invisible rows that break ST_Contains and pollute the address counts.
--
--  2. Indigenous Regions 901 (Christmas - Cocos), 902 (Jervis Bay) and 903 (Norfolk Island)
--     carry state = 'Other Territories', but geo.state has NO such row — 20260707140000
--     split it into codes 90101-90104. So those three have no state parent, and 901 spans
--     TWO geo.state rows anyway. regionParents degrades to "no state parent" rather than
--     throwing. `state` therefore carries the FULL ABS state name, resolved by name against
--     geo.state.name (the same lookup ced/sed/lga use).
--
-- Codes are state-digit-prefixed at every level (IREG '101', IARE '101001', ILOC '10100101'),
-- which is load-bearing: the admin map filters tiles with `slice(code,0,1) == stateDigit` and
-- frames the viewport from `code[0]`.

CREATE TABLE IF NOT EXISTS "geo"."ireg" (
  "code"  TEXT PRIMARY KEY,               -- ireg_code_2021, e.g. '101'
  "name"  TEXT,
  "state" TEXT,                           -- FULL state name, e.g. 'New South Wales'
  "geom"  geometry(MultiPolygon, 4326)
);

CREATE TABLE IF NOT EXISTS "geo"."iare" (
  "code"      TEXT PRIMARY KEY,           -- iare_code_2021, e.g. '101001'
  "name"      TEXT,
  "ireg_code" TEXT,                       -- id-only ref → geo.ireg.code
  "state"     TEXT,
  "geom"      geometry(MultiPolygon, 4326)
);

-- `iloc` carries BOTH parent codes, denormalised straight from the ABS row. That is what
-- makes a single address → ILOC spatial join sufficient to attribute all three levels.
CREATE TABLE IF NOT EXISTS "geo"."iloc" (
  "code"      TEXT PRIMARY KEY,           -- iloc_code_2021, e.g. '10100101'
  "name"      TEXT,
  "iare_code" TEXT,                       -- id-only ref → geo.iare.code
  "ireg_code" TEXT,                       -- id-only ref → geo.ireg.code
  "state"     TEXT,
  "geom"      geometry(MultiPolygon, 4326)
);

CREATE INDEX IF NOT EXISTS "ireg_geom_gix" ON "geo"."ireg" USING gist ("geom");
CREATE INDEX IF NOT EXISTS "iare_geom_gix" ON "geo"."iare" USING gist ("geom");
CREATE INDEX IF NOT EXISTS "iloc_geom_gix" ON "geo"."iloc" USING gist ("geom");
CREATE INDEX IF NOT EXISTS "iare_ireg_idx" ON "geo"."iare" ("ireg_code");
CREATE INDEX IF NOT EXISTS "iloc_iare_idx" ON "geo"."iloc" ("iare_code");
CREATE INDEX IF NOT EXISTS "iloc_ireg_idx" ON "geo"."iloc" ("ireg_code");

-- ── Per-address Indigenous geography ────────────────────────────────────────
-- Nullable, no default → metadata-only on PG11+, instant even at 16.9M rows.
-- Backfilled by `geo:first-nations` (or a full `geo:map`), never here: the ST_Contains
-- UPDATE takes minutes and would hold a write lock on address_region for the whole deploy.
ALTER TABLE "geo"."address_region" ADD COLUMN IF NOT EXISTS "iloc_code" TEXT;
ALTER TABLE "geo"."address_region" ADD COLUMN IF NOT EXISTS "iare_code" TEXT;
ALTER TABLE "geo"."address_region" ADD COLUMN IF NOT EXISTS "ireg_code" TEXT;

-- PARTIAL indexes: near-free while the columns are NULL, and still used afterwards because
-- an equality lookup implies NOT NULL.
CREATE INDEX IF NOT EXISTS "address_region_iloc_idx"
  ON "geo"."address_region" ("iloc_code") WHERE "iloc_code" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "address_region_iare_idx"
  ON "geo"."address_region" ("iare_code") WHERE "iare_code" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "address_region_ireg_idx"
  ON "geo"."address_region" ("ireg_code") WHERE "ireg_code" IS NOT NULL;

-- ── Deliberately NOT done here ──────────────────────────────────────────────
-- No geometry (the loader fetches it from ABS), no column backfill, and NO
-- geo.region_address_count rows for 'ireg'/'iare'/'iloc'.
--
-- Publishing counts without the columns is precisely the bug the chambers migration shipped
-- and had to fix: divisionDetail reads addressCount from the summary and contactCount from
-- the per-address column, so a populated summary beside a NULL column makes the layer LIE —
-- contactCount reads 0 and withoutContacts is overstated by every contact the org has there.
-- Both stay empty until `geo:first-nations` publishes them together in one transaction, so
-- the layer degrades symmetrically (0/0/0), exactly like the `state` layer before the
-- mesh-block backfill.
--
-- geo.dataset_meta rows for ireg/iare/iloc are written by the loader, which knows the real
-- row counts and the source URL.
