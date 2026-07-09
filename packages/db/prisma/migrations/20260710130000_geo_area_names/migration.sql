-- Place-like names for the two ABS statistical layers that ship UNNAMED: mesh blocks and SA1s.
-- Additive and idempotent; applied with `prisma migrate deploy` (never `migrate dev`).
--
-- `geo` is a raw-SQL/PostGIS schema and is absent from `datasource.schemas`, so nothing here
-- has a matching model in schema.prisma.
--
-- Context: geo.sa1 already has a (perennially NULL) `name` column and a `sa1_name_trgm` index
-- from 20260704090000_geo_perf; only geo.meshblock lacks a name column. The names themselves are
-- COMPUTED by the `geo:names` backfill (apps/api/src/scripts/geo/backfill-area-names.ts) from the
-- SA2 suburb name + a compass sector off the geometry — this migration just makes room and lets
-- the new names be searched (ILIKE '%q%' needs a GIN trigram index, same as the sa1..sa4 names).

ALTER TABLE "geo"."meshblock" ADD COLUMN IF NOT EXISTS "name" TEXT;

-- pg_trgm is already enabled (20260704090000_geo_perf). sa1.name already has sa1_name_trgm;
-- the mesh-block name is new, so index it to keep area search off a 368k-row seq scan.
CREATE INDEX IF NOT EXISTS "meshblock_name_trgm" ON "geo"."meshblock" USING gin (name gin_trgm_ops);
