-- ABS demographics — Census 2021 (General Community Profile) + SEIFA 2021 indicators, plus a few
-- derived "lifestyle" proxies, keyed to ASGS geography (meshblock → SA1 → SA2 → SA3 → SA4). Raw
-- PostGIS/SQL: `geo` is absent from datasource.schemas, so nothing here has a matching model in
-- schema.prisma.
--
-- Additive + idempotent; applied with `prisma migrate deploy` (never `migrate dev`). No geometry of
-- its own — every value references a geo boundary table id-only by `code` (no cross-schema FK), like
-- geo.referendum_result / geo.polling_place. The loader (apps/api/src/scripts/demographics/load-abs.ts)
-- seeds the catalogue and populates values; nothing is seeded here.
--
-- Two tables: a CATALOGUE (`abs_indicator`, one row per indicator) and a tall VALUE table
-- (`abs_value`, one row per level × region × indicator). Tall (not wide) so indicators can be added
-- by the loader without a migration, and so the choropleth read is a single indexed scan.

-- ── Catalogue ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo.abs_indicator (
  key         TEXT PRIMARY KEY,               -- stable slug, e.g. 'median_age', 'seifa_irsd_decile'
  name        TEXT NOT NULL,                  -- display name
  category    TEXT NOT NULL,                  -- demographic|socioeconomic|education|cultural|housing|lifestyle
  unit        TEXT NOT NULL,                  -- years|percent|aud|decile|ratio|count|ordinal
  format      TEXT,                           -- render hint: number|percent|currency|decile|ordinal
  description TEXT,
  source      TEXT,                           -- e.g. 'ABS Census 2021 · G02' / 'ABS SEIFA 2021'
  polarity    TEXT NOT NULL DEFAULT 'neutral',-- advantage|neutral|disadvantage (ramp direction)
  levels      TEXT[] NOT NULL DEFAULT '{}',   -- ASGS levels this indicator is loaded at
  sort        INTEGER NOT NULL DEFAULT 0,     -- display order within a category
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS abs_indicator_category_idx ON geo.abs_indicator (category, sort);

-- ── Values ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo.abs_value (
  level         TEXT NOT NULL,                -- mb|sa1|sa2|sa3|sa4  (matches geo.<level>.code)
  code          TEXT NOT NULL,                -- the ASGS code (id-only reference to the boundary row)
  indicator_key TEXT NOT NULL,                -- → geo.abs_indicator.key
  value         DOUBLE PRECISION,             -- null = suppressed / not published at this level
  PRIMARY KEY (level, code, indicator_key)    -- PK prefix (level, code) serves the region-profile read
);

-- The choropleth read + national quantile breaks: all regions at a level for one indicator.
CREATE INDEX IF NOT EXISTS abs_value_ind_level_idx ON geo.abs_value (indicator_key, level);
