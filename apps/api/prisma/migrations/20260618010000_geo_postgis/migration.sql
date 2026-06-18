-- G-NAF + ASGS + electoral/LGA divisions geo layer.
-- Isolated in the `geo` schema; PostGIS for spatial indexes + ST_Contains.
-- Additive: nothing in the default (app) schema changes except Contact.gnafPid.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS geo;

-- ── Dataset provenance (powers /settings/data) ──────────────────────────────
CREATE TABLE IF NOT EXISTS geo.dataset_meta (
  key           TEXT PRIMARY KEY,          -- gnaf | asgs_mb | sa1..sa4 | lga | ced | sed
  label         TEXT NOT NULL,
  source_url    TEXT,
  release_date  TEXT,
  licence       TEXT,
  row_count     BIGINT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | loading | loaded | error
  last_ingested TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Boundary layers (WGS84 / EPSG:4326) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo.meshblock (
  mb_code   TEXT PRIMARY KEY,
  sa1_code  TEXT, sa2_code TEXT, sa3_code TEXT, sa4_code TEXT,
  lga_code  TEXT, state TEXT,
  geom      geometry(MultiPolygon, 4326)
);
CREATE TABLE IF NOT EXISTS geo.sa1 ( code TEXT PRIMARY KEY, name TEXT, sa2_code TEXT, geom geometry(MultiPolygon,4326) );
CREATE TABLE IF NOT EXISTS geo.sa2 ( code TEXT PRIMARY KEY, name TEXT, sa3_code TEXT, geom geometry(MultiPolygon,4326) );
CREATE TABLE IF NOT EXISTS geo.sa3 ( code TEXT PRIMARY KEY, name TEXT, sa4_code TEXT, geom geometry(MultiPolygon,4326) );
CREATE TABLE IF NOT EXISTS geo.sa4 ( code TEXT PRIMARY KEY, name TEXT, state TEXT, geom geometry(MultiPolygon,4326) );
CREATE TABLE IF NOT EXISTS geo.lga ( code TEXT PRIMARY KEY, name TEXT, state TEXT, geom geometry(MultiPolygon,4326) );
CREATE TABLE IF NOT EXISTS geo.ced ( code TEXT PRIMARY KEY, name TEXT, state TEXT, geom geometry(MultiPolygon,4326) ); -- federal
CREATE TABLE IF NOT EXISTS geo.sed ( code TEXT PRIMARY KEY, name TEXT, state TEXT, geom geometry(MultiPolygon,4326) ); -- state electoral

-- ── G-NAF addresses as points ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo.gnaf_address (
  gnaf_pid      TEXT PRIMARY KEY,
  address_label TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  state         TEXT,
  mb_code       TEXT,
  geom          geometry(Point, 4326)
);

-- ── Materialised per-address region mapping (the app reads this) ─────────────
CREATE TABLE IF NOT EXISTS geo.address_region (
  gnaf_pid  TEXT PRIMARY KEY,
  mb_code   TEXT, sa1_code TEXT, sa2_code TEXT, sa3_code TEXT, sa4_code TEXT,
  lga_code  TEXT, ced_code TEXT, sed_code TEXT
);

-- ── Spatial (GIST) indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS meshblock_geom_gix ON geo.meshblock USING GIST (geom);
CREATE INDEX IF NOT EXISTS sa1_geom_gix ON geo.sa1 USING GIST (geom);
CREATE INDEX IF NOT EXISTS sa2_geom_gix ON geo.sa2 USING GIST (geom);
CREATE INDEX IF NOT EXISTS sa3_geom_gix ON geo.sa3 USING GIST (geom);
CREATE INDEX IF NOT EXISTS sa4_geom_gix ON geo.sa4 USING GIST (geom);
CREATE INDEX IF NOT EXISTS lga_geom_gix ON geo.lga USING GIST (geom);
CREATE INDEX IF NOT EXISTS ced_geom_gix ON geo.ced USING GIST (geom);
CREATE INDEX IF NOT EXISTS sed_geom_gix ON geo.sed USING GIST (geom);
CREATE INDEX IF NOT EXISTS gnaf_geom_gix ON geo.gnaf_address USING GIST (geom);
CREATE INDEX IF NOT EXISTS gnaf_state_idx ON geo.gnaf_address (state);

-- ── Lookup indexes on the mapping ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS address_region_ced_idx ON geo.address_region (ced_code);
CREATE INDEX IF NOT EXISTS address_region_sed_idx ON geo.address_region (sed_code);
CREATE INDEX IF NOT EXISTS address_region_lga_idx ON geo.address_region (lga_code);
CREATE INDEX IF NOT EXISTS address_region_sa1_idx ON geo.address_region (sa1_code);
CREATE INDEX IF NOT EXISTS address_region_mb_idx  ON geo.address_region (mb_code);

-- ── App link: Contact → G-NAF address ───────────────────────────────────────
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "gnafPid" TEXT;
CREATE INDEX IF NOT EXISTS "Contact_organizationId_gnafPid_idx" ON "Contact" ("organizationId", "gnafPid");
