-- Geo query-layer performance (additive; applied with `prisma migrate deploy`).
--
-- 1. region_address_count: precomputed national address counts per region — the
--    summary listDivisions' docstring always claimed. Kills the 16.9M-row
--    GROUP BY seq scan on every divisions load and the live COUNT on every
--    division/area detail open. Populated by the geo ETL (geo:map /
--    load-prod.sh) — exactly as fresh as dataset_meta.last_ingested.
-- 2. pg_trgm + GIN trigram indexes: area search is ILIKE '%q%', which cannot
--    use a btree — meshblock (368k) and sa1 (61k) seq-scanned per keystroke.

CREATE TABLE "geo"."region_address_count" (
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "region_address_count_pkey" PRIMARY KEY ("kind", "code")
);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes on every column the area search hits (name + code per layer;
-- meshblocks have no name). Plain (non-CONCURRENT) builds — these tables top
-- out at 368k rows, seconds each, and CONCURRENTLY can't run inside the
-- migration transaction.
CREATE INDEX "meshblock_mb_code_trgm" ON "geo"."meshblock" USING gin (mb_code gin_trgm_ops);
CREATE INDEX "sa1_code_trgm" ON "geo"."sa1" USING gin (code gin_trgm_ops);
CREATE INDEX "sa1_name_trgm" ON "geo"."sa1" USING gin (name gin_trgm_ops);
CREATE INDEX "sa2_code_trgm" ON "geo"."sa2" USING gin (code gin_trgm_ops);
CREATE INDEX "sa2_name_trgm" ON "geo"."sa2" USING gin (name gin_trgm_ops);
CREATE INDEX "sa3_code_trgm" ON "geo"."sa3" USING gin (code gin_trgm_ops);
CREATE INDEX "sa3_name_trgm" ON "geo"."sa3" USING gin (name gin_trgm_ops);
CREATE INDEX "sa4_code_trgm" ON "geo"."sa4" USING gin (code gin_trgm_ops);
CREATE INDEX "sa4_name_trgm" ON "geo"."sa4" USING gin (name gin_trgm_ops);
