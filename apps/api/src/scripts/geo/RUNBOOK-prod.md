# Prod geo load runbook (co-located in the uprise app DB)

One-time (then quarterly-refresh) load of the national address universe into **production
Neon** — the `geo` schema co-located in the app DB. The schema + PostGIS are already migrated
on prod; this loads the **data**. General recipe + sources live in `README.md`; this is the
exact ordered prod sequence. Run on a host with `psql`, ~10 GB free disk, and the repo.

## 0. Prerequisite — rotate the DB password FIRST

The prod `neondb_owner` password was exposed in a chat transcript. Before loading:
1. Neon Console → uprise project → **Roles** → reset `neondb_owner` password.
2. Let the Vercel↔Neon integration repush envs (or update `DATABASE_URL*` on `uprise-api`).
3. Use the **new** unpooled URL below.

```bash
# The UNPOOLED (direct) URL — host has NO "-pooler". Migrations/bulk DDL need it; the
# pooled pgBouncer endpoint can't. connect_timeout=30 absorbs Neon's scale-to-zero cold start.
export GEO_DB_URL='postgresql://neondb_owner:<NEW_PW>@ep-divine-surf-a7wf5b2p.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&connect_timeout=30'

# Neon computes sleep when idle and the FIRST connection can P1001 before waking. Always wake
# it right before each step:
psql "$GEO_DB_URL" -c 'select 1;'
```

The geo migration (`20260618010000_geo_postgis`) is already applied on prod — PostGIS +
the 11 `geo.*` tables exist (verify: `psql "$GEO_DB_URL" -c "\dt geo.*"`). Do NOT re-run
migrations here.

## 1. Get the data into `data/geo/` (gitignored)

```bash
# G-NAF national (≈1.7 GB) — already downloaded this session if present.
curl -L -C - -o data/geo/gnaf.zip \
 "https://data.gov.au/data/dataset/19432f89-dc3a-4ef3-b943-5326ef1dbecc/resource/f8666213-4079-44da-bede-ebda3a4363e0/download/g-naf_may26_allstates_gda2020_psv_1023.zip"
unzip -o data/geo/gnaf.zip -d data/geo/gnaf

# Boundaries (ABS GDA2020 shapefiles) into the dirs load-boundaries.ts expects:
#   data/geo/ced/CED_2025_AUST_GDA2020.shp   (AEC/ABS federal)
#   data/geo/sed/SED_2025_AUST_GDA2020.shp   (ABS state electoral)
#   data/geo/lga/LGA_2024_AUST_GDA2020.shp   (ABS LGA — matches LAYERS in load-boundaries.ts)
# CED/SED already downloaded this session. Get LGA_2024 from the ABS ASGS download page.
```

## 2. Load boundaries (CED + SED + LGA) — no GDAL needed

```bash
psql "$GEO_DB_URL" -c 'select 1;'                      # wake compute
DATABASE_URL="$GEO_DB_URL" npm --prefix apps/api run geo:load-boundaries
# Streams each .shp via the `shapefile` pkg → ST_GeomFromGeoJSON. Expect ~150 CED, ~430 SED,
# ~560 LGA features. Idempotent (ON CONFLICT (code) DO UPDATE).
```

## 3. Load G-NAF addresses — per state `\copy`

Loop every state PSV from the national zip (NSW/VIC/QLD/SA/WA/TAS/NT/ACT/OT) using the
**validated recipe in `README.md` §"Confirmed run"**. For each `<ST>`:

```bash
# from data/geo/gnaf/G-NAF/G-NAF*/Standard/
psql "$GEO_DB_URL" <<'SQL'
CREATE TEMP TABLE g(pid text,lng float8,lat float8);
\copy g FROM PROGRAM 'tail -n +2 <ST>_ADDRESS_DEFAULT_GEOCODE_psv.psv | cut -d"|" -f4,6,7' WITH (FORMAT csv, DELIMITER '|');
CREATE TEMP TABLE d(pid text,num text,postcode text);
\copy d FROM PROGRAM 'tail -n +2 <ST>_ADDRESS_DETAIL_psv.psv | cut -d"|" -f1,18,27' WITH (FORMAT csv, DELIMITER '|');
INSERT INTO geo.gnaf_address (gnaf_pid,address_label,lat,lng,state,geom)
SELECT g.pid, coalesce(d.num,'')||' · '||coalesce(d.postcode,''), g.lat, g.lng, '<ST>',
       ST_SetSRID(ST_MakePoint(g.lng,g.lat),4326)
FROM g JOIN d ON d.pid=g.pid WHERE g.lat IS NOT NULL
ON CONFLICT (gnaf_pid) DO NOTHING;
SQL
```

(National is ~15M rows — runs in minutes per state over a direct connection. Bandwidth is the
limit; run on a host near the data, not over a home link.)

## 4. Build the address↔division mapping

```bash
psql "$GEO_DB_URL" -c 'select 1;'                      # wake compute
DATABASE_URL="$GEO_DB_URL" npm --prefix apps/api run geo:map
# Populates geo.address_region: CED/SED/LGA via GIST ST_Contains (LGA also fills from
# mesh-block nesting when MB is loaded — see below), then refreshes geo.dataset_meta.
```

## 5. Verify

```bash
psql "$GEO_DB_URL" -c "SELECT count(*) FROM geo.address_region;"              -- ≈ national G-NAF count
psql "$GEO_DB_URL" -c "SELECT key,row_count,status,last_ingested FROM geo.dataset_meta ORDER BY key;"
psql "$GEO_DB_URL" -c "SELECT c.name, count(*) FROM geo.address_region ar JOIN geo.ced c ON c.code=ar.ced_code GROUP BY 1 ORDER BY 2 DESC LIMIT 5;"
```
- App: `/canvass/divisions` (Federal / State / Local tabs) lists divisions with real address +
  without-contact counts; `/settings/data` shows loaded datasets; cutting a turf from a
  division with the "Existing + cold doors" universe materialises cold-door contacts.

## Notes
- **Mesh blocks / SA1–SA4 are optional.** CED/SED/LGA (the canvassing universe) work via
  `ST_Contains` without them. To add the full ASGS hierarchy later: load ABS Mesh Blocks 2021
  into `geo.meshblock` (carrying sa1–4 + lga codes) and the G-NAF `mb_code`
  (`*_ADDRESS_MESH_BLOCK_2021_psv.psv`), then re-run `geo:map` — `address_region` SA1–4 +
  lga_code then populate deterministically.
- **Storage:** national G-NAF + geometries add several GB to the prod Neon DB — confirm the
  tier has headroom before step 3.
- **Idempotent:** every step upserts; safe to re-run. Quarterly refresh = re-run 1→4.
