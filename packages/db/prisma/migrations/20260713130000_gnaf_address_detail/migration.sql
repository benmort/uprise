-- G-NAF address detail — street name + suburb/locality, so a door reads "96 Smith Street,
-- Richmond VIC 3121" instead of the number-and-postcode-only "96 · 3121" the original ingest
-- stored (load-prod.sh read only the number + postcode columns of the G-NAF PSV). Raw PostGIS/SQL:
-- `geo` is absent from datasource.schemas, so nothing here has a matching model in schema.prisma.
--
-- Additive + idempotent; applied with `prisma migrate deploy` (never `migrate dev`). The re-ingest
-- (apps/api/src/scripts/geo/load-gnaf-detail.ts) populates the new columns and recomposes
-- `address_label`; existing rows keep their old label until it re-runs. The walk-list read then
-- joins these columns live by Contact.gnafPid — no per-turf backfill.

ALTER TABLE geo.gnaf_address ADD COLUMN IF NOT EXISTS street   TEXT;  -- e.g. "Smith Street"
ALTER TABLE geo.gnaf_address ADD COLUMN IF NOT EXISTS locality TEXT;  -- suburb / locality, e.g. "Richmond"
ALTER TABLE geo.gnaf_address ADD COLUMN IF NOT EXISTS postcode TEXT;  -- e.g. "3121"

-- Grouping/lookup: the walk list groups consecutive stops by (street, locality).
CREATE INDEX IF NOT EXISTS gnaf_street_locality_idx ON geo.gnaf_address (street, locality);
