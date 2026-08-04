-- Postcode → electorate lookup table for the autodialer's electoral targeting.
--
-- geo.gnaf_address is ~15M rows with no postcode index; the IVR needs sub-100ms
-- postcode resolution, so this materialises the DISTINCT (postcode, region)
-- pairs (a few thousand rows) with address counts for ranking. Kinds:
--   ced — federal division (House of Reps)  → civic.Politician geoKind 'ced'
--   sed — state electoral district (lower)  → civic.Politician geoKind 'sed_lower'
-- (address_region carries no upper-house mapping; officeTarget 'upper' resolves
-- through chamber/state membership in the service instead.)
--
-- NOTE long-running: the index + build scan G-NAF once each (~minutes on prod).
-- Deploy off-peak. Rebuilt by the geo:map pipeline whenever G-NAF reloads.

CREATE INDEX IF NOT EXISTS "gnaf_address_postcode_idx" ON "geo"."gnaf_address"("postcode");

CREATE TABLE IF NOT EXISTS "geo"."postcode_region" (
    "postcode" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "address_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "postcode_region_pkey" PRIMARY KEY ("postcode", "kind", "code")
);

INSERT INTO "geo"."postcode_region" ("postcode", "kind", "code", "name", "address_count")
SELECT a.postcode, 'ced', ar.ced_code, MAX(d.name), COUNT(*)::int
FROM "geo"."gnaf_address" a
JOIN "geo"."address_region" ar ON ar.gnaf_pid = a.gnaf_pid
LEFT JOIN "geo"."ced" d ON d.code = ar.ced_code
WHERE a.postcode IS NOT NULL AND ar.ced_code IS NOT NULL
GROUP BY a.postcode, ar.ced_code
ON CONFLICT ("postcode", "kind", "code") DO UPDATE
  SET "name" = EXCLUDED."name", "address_count" = EXCLUDED."address_count";

INSERT INTO "geo"."postcode_region" ("postcode", "kind", "code", "name", "address_count")
SELECT a.postcode, 'sed', ar.sed_code, MAX(d.name), COUNT(*)::int
FROM "geo"."gnaf_address" a
JOIN "geo"."address_region" ar ON ar.gnaf_pid = a.gnaf_pid
LEFT JOIN "geo"."sed" d ON d.code = ar.sed_code
WHERE a.postcode IS NOT NULL AND ar.sed_code IS NOT NULL
GROUP BY a.postcode, ar.sed_code
ON CONFLICT ("postcode", "kind", "code") DO UPDATE
  SET "name" = EXCLUDED."name", "address_count" = EXCLUDED."address_count";
