# Geo ETL — G-NAF + ASGS + electoral/LGA → address↔division mapping

Loads the Australian address base and boundaries into the `geo` schema (created by
migration `20260618010000_geo_postgis`) and builds `geo.address_region` (every address
tagged with mesh block, SA1–SA4, LGA, federal CED, state SED). Powers the canvassing
"addresses without contacts" universe + `/canvass/divisions` + `/settings/data`.

**Run on a host with disk (~10 GB free), `psql`, and GDAL (`ogr2ogr`).** Not the web
sandbox. Validate on one state (ACT) first, then run national.

> **Canonical loaders (no GDAL needed).** `geo:load-boundaries` loads CED/SED **and** the ASGS
> meshblock + SA1–SA4 layers from `data/geo/{ced,sed,meshblock,sa1,sa2,sa3,sa4}/*.shp` via the
> `shapefile` pkg (batched inserts; writes real `geo.dataset_meta` provenance, no "(demo)"). Then
> per-state G-NAF `\copy` (`load-prod.sh` / RUNBOOK §3) → `backfill-mb.sh` (fills
> `geo.gnaf_address.mb_code` so SA1–4 nest per address) → `geo:map`. The ogr2ogr steps below are
> historical reference; the exact ordered prod sequence is in **`RUNBOOK-prod.md`**.

## Prerequisites
- Postgres + PostGIS (the migration runs `CREATE EXTENSION postgis`).
- `psql` (libpq) and GDAL `ogr2ogr` (boundaries). On macOS: `brew install gdal` (if
  `ogr2ogr` errors on a missing `libpoppler` dylib, `brew reinstall poppler gdal`).
- `export GEO_DB_URL=postgresql://…` (the target DB).

## 1. Fetch (sources + licences — record release dates in `geo.dataset_meta`)
- **G-NAF** — data.gov.au "Geocoded National Address File" (Geoscape, open/attribution).
  One national zip (~1.5 GB) → per-state PSV in `Standard/`: `*_ADDRESS_DETAIL_psv.psv`
  (lat/lng), `*_ADDRESS_MESH_BLOCK_2021_psv.psv` (address PID → MB_2021 code).
- **ASGS Ed3 2021** — ABS Mesh Blocks, SA1–SA4 (GeoPackage/Shapefile). MB carries SA1–4 +
  LGA codes.
- **LGA 2021** — ABS LGA boundaries.
- **Federal CED** — AEC current Commonwealth electoral divisions (latest redistribution).
- **State SED** — each state electoral commission / ABS SED 2021.

Download into `data/geo/` (gitignored).

## 2. Load boundaries (ogr2ogr → PostGIS, reprojected to 4326)
```
ogr2ogr -f PostgreSQL "PG:$GEO_DB_URL" data/geo/MB_2021_AUST.gpkg \
  -nln geo._mb_raw -t_srs EPSG:4326 -overwrite -lco GEOMETRY_NAME=geom
# repeat for SA1-SA4, LGA, CED, SED into geo._<layer>_raw, then INSERT…SELECT into the
# typed tables (geo.meshblock, geo.sa1…, geo.ced, geo.sed) mapping the ABS/AEC code+name
# columns (e.g. MB_CODE_2021, SA1_CODE_2021, CED_NAME_2021) — see map.ts for the SQL.
```
(No GDAL? Use a Node `shapefile` reader streaming features → `ST_GeomFromGeoJSON`.)

## 3. Load G-NAF addresses
```
# Stage the PSV with \copy, then transform into geo.gnaf_address (geom from lat/lng,
# mb_code from the ADDRESS_MESH_BLOCK_2021 join). map.ts runs the staging + transform SQL.
npm --prefix apps/api run geo:load   # (psql \copy of the PSVs in data/geo/Standard)
```

## 4. Build the mapping
```
npm --prefix apps/api run geo:map
```
`map.ts`: mb_code from G-NAF; SA1–SA4 + LGA from mesh-block codes/attributes; CED + SED via
GIST-indexed `ST_Contains` spatial join (address point → latest electoral polygon);
populates `geo.address_region` + refreshes `geo.dataset_meta` row counts.

## 5. Verify
- `SELECT count(*) FROM geo.address_region;` ≈ G-NAF address count.
- Spot-check ~10 known addresses map to the correct CED/SED/LGA/SA codes.
- App: `/canvass/divisions` shows divisions with address + without-contact counts;
  "Cut turf from division" works.

## Refresh cadence
G-NAF + ASGS are periodic releases — re-run fetch → load → map (idempotent upserts).

---

## Confirmed run (2026-06-18) — proven recipe

**G-NAF (live URL, May 2026, 1.7 GB):**
```
curl -L -C - -o data/geo/gnaf.zip \
 "https://data.gov.au/data/dataset/19432f89-dc3a-4ef3-b943-5326ef1dbecc/resource/f8666213-4079-44da-bede-ebda3a4363e0/download/g-naf_may26_allstates_gda2020_psv_1023.zip"
```
**Address load (validated on ACT — 282,553 addresses; no GDAL needed).** For each state,
extract `<ST>_ADDRESS_DETAIL_psv.psv` + `<ST>_ADDRESS_DEFAULT_GEOCODE_psv.psv`, then in psql:
```
CREATE TEMP TABLE g(pid text,lng float8,lat float8);
\copy g FROM PROGRAM 'tail -n +2 <ST>_ADDRESS_DEFAULT_GEOCODE_psv.psv | cut -d"|" -f4,6,7' WITH (FORMAT csv, DELIMITER '|');
CREATE TEMP TABLE d(pid text,num text,postcode text);
\copy d FROM PROGRAM 'tail -n +2 <ST>_ADDRESS_DETAIL_psv.psv | cut -d"|" -f1,18,27' WITH (FORMAT csv, DELIMITER '|');
INSERT INTO geo.gnaf_address (gnaf_pid,address_label,lat,lng,state,geom)
SELECT g.pid, coalesce(d.num,'')||' · '||coalesce(d.postcode,''), g.lat, g.lng, '<ST>',
       ST_SetSRID(ST_MakePoint(g.lng,g.lat),4326)
FROM g JOIN d ON d.pid=g.pid WHERE g.lat IS NOT NULL
ON CONFLICT (gnaf_pid) DO NOTHING;
```
(Columns: GEOCODE f4=ADDRESS_DETAIL_PID, f6=LONGITUDE, f7=LATITUDE; DETAIL f1=PID,
f18=NUMBER_FIRST, f27=POSTCODE. A richer `address_label` needs the STREET_LOCALITY + LOCALITY
joins — optional.)

**Boundaries — GDAL note.** `ogr2ogr` on this machine is mid-broken-reinstall
(`gdal/3.10.2_3.reinstall`); finish it with `brew reinstall gdal` (large — pulls LLVM/Arrow)
**or** use the **no-GDAL path**: `pnpm add -D shapefile` and stream each `.shp`'s features →
`INSERT … ST_GeomFromGeoJSON(feature.geometry)` into `geo.{meshblock,sa1..4,lga,ced,sed}`.
ABS ASGS Ed3 boundary files + AEC federal boundaries are downloaded from the ABS/AEC sites
(GeoPackage/Shapefile); record each file's release date in `geo.dataset_meta`.

Then `npm --prefix apps/api run geo:map` populates `geo.address_region`.
