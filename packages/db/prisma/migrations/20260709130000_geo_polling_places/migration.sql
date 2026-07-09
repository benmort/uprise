-- Polling places (booths) as points — federal (AEC) + state/territory (The Tally Room).
-- Raw PostGIS table (geo.* is not modelled in schema.prisma), WGS84 / EPSG:4326,
-- mirroring geo.gnaf_address. Additive; applied with `prisma migrate deploy`.

CREATE TABLE IF NOT EXISTS geo.polling_place (
  id            TEXT PRIMARY KEY,          -- namespaced '<jurisdiction>:<sourceId>' (globally unique, stable per load)
  jurisdiction  TEXT NOT NULL,             -- federal | nsw | vic | qld | wa | sa | tas | act | nt
  source_id     TEXT,                      -- the source's own polling place id (unprefixed)
  name          TEXT,                      -- polling place name
  premises      TEXT,                      -- premises / venue name
  address       TEXT,                      -- assembled street address
  suburb        TEXT,
  state         TEXT,                      -- state/territory abbreviation (NSW/VIC/…)
  postcode      TEXT,
  division_name TEXT,                      -- electorate as the SOURCE names it (federal division OR state district)
  ced_code      TEXT,                      -- federal division containing the point (ST_Contains geo.ced)
  sed_code      TEXT,                      -- state electorate containing the point (ST_Contains geo.sed)
  place_type    TEXT,                      -- best-effort booth type (e.g. election_day | pre_poll)
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  geom          geometry(Point, 4326)
);

CREATE INDEX IF NOT EXISTS polling_place_geom_gix  ON geo.polling_place USING GIST (geom);
CREATE INDEX IF NOT EXISTS polling_place_jur_idx   ON geo.polling_place (jurisdiction);
CREATE INDEX IF NOT EXISTS polling_place_state_idx ON geo.polling_place (state);
CREATE INDEX IF NOT EXISTS polling_place_ced_idx   ON geo.polling_place (ced_code);
CREATE INDEX IF NOT EXISTS polling_place_sed_idx   ON geo.polling_place (sed_code);
