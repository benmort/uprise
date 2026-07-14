-- Full G-NAF address detail + preserved cross-references. Additive on top of
-- 20260713130000_gnaf_address_detail (which added street/locality/postcode). Stores everything
-- useful the G-NAF release holds about an address, and keeps the G-NAF reference PIDs so each
-- address stays navigable to its street-locality, locality, site, property and mesh block. Raw
-- PostGIS/SQL (geo is outside datasource.schemas). The re-ingest (scripts/geo/load-gnaf.sh) UPSERTs
-- by gnaf_pid, so existing Contact.gnafPid and geo.address_region links are preserved, not broken.

ALTER TABLE geo.gnaf_address
  ADD COLUMN IF NOT EXISTS building_name       TEXT,
  ADD COLUMN IF NOT EXISTS flat_type           TEXT,
  ADD COLUMN IF NOT EXISTS flat_number         TEXT,
  ADD COLUMN IF NOT EXISTS level_type          TEXT,
  ADD COLUMN IF NOT EXISTS level_number        TEXT,
  ADD COLUMN IF NOT EXISTS lot_number          TEXT,
  ADD COLUMN IF NOT EXISTS number_first        TEXT,
  ADD COLUMN IF NOT EXISTS number_last         TEXT,
  ADD COLUMN IF NOT EXISTS street_name         TEXT,
  ADD COLUMN IF NOT EXISTS street_type         TEXT,
  ADD COLUMN IF NOT EXISTS street_suffix       TEXT,
  ADD COLUMN IF NOT EXISTS location_description TEXT,
  ADD COLUMN IF NOT EXISTS confidence          INTEGER,
  ADD COLUMN IF NOT EXISTS primary_secondary   TEXT,   -- P (primary) | S (secondary)
  ADD COLUMN IF NOT EXISTS alias_principal     TEXT,   -- P (principal) | A (alias)
  ADD COLUMN IF NOT EXISTS private_street      TEXT,
  ADD COLUMN IF NOT EXISTS legal_parcel_id     TEXT,
  -- Reference PIDs — the links to the other G-NAF objects (kept so nothing is lost).
  ADD COLUMN IF NOT EXISTS street_locality_pid TEXT,
  ADD COLUMN IF NOT EXISTS locality_pid        TEXT,
  ADD COLUMN IF NOT EXISTS address_site_pid    TEXT,
  ADD COLUMN IF NOT EXISTS property_pid        TEXT,
  ADD COLUMN IF NOT EXISTS gnaf_property_pid   TEXT,
  ADD COLUMN IF NOT EXISTS mb_2021_pid         TEXT,
  ADD COLUMN IF NOT EXISTS mb_2021_code        TEXT;

-- Navigate by reference.
CREATE INDEX IF NOT EXISTS gnaf_street_locality_pid_idx ON geo.gnaf_address (street_locality_pid);
CREATE INDEX IF NOT EXISTS gnaf_locality_pid_idx        ON geo.gnaf_address (locality_pid);
CREATE INDEX IF NOT EXISTS gnaf_mb2021_code_idx         ON geo.gnaf_address (mb_2021_code);
