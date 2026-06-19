#!/usr/bin/env bash
# Load the national G-NAF address universe + build the address↔division mapping
# (federal CED + state SED) against a target Postgres (prod Neon). Idempotent and
# re-runnable. Designed to run from a host with TCP 5432 egress to the DB — locally
# (off a throttled link) it's impractical; the GitHub Actions runner is the intended
# host (see .github/workflows/load-gnaf-prod.yml).
#
# Env:
#   PGURL     required — libpq connection string (strip Prisma's ?schema=…; ?sslmode=require ok)
#   GNAF_ZIP  required — path to the national G-NAF PSV zip
#   STATES    optional — space-separated (default: all 9)
#   PREFIX    optional — zip-internal dir (default: "G-NAF/G-NAF MAY 2026/Standard")
set -uo pipefail

: "${PGURL:?set PGURL}"
: "${GNAF_ZIP:?set GNAF_ZIP}"
STATES="${STATES:-NSW VIC QLD WA SA TAS NT ACT OT}"
PREFIX="${PREFIX:-G-NAF/G-NAF MAY 2026/Standard}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Preflight: boundaries must already be loaded (we only map addresses here).
CED=$(psql "$PGURL" -tAc "SELECT count(*) FROM geo.ced;")
SED=$(psql "$PGURL" -tAc "SELECT count(*) FROM geo.sed;")
echo "Boundaries present: ced=$CED sed=$SED"
if [ "${CED:-0}" -lt 1 ] || [ "${SED:-0}" -lt 1 ]; then
  echo "ERROR: geo.ced/geo.sed empty — load boundaries before mapping" >&2
  exit 1
fi

# ── Load addresses, one state at a time (idempotent via ON CONFLICT DO NOTHING) ──
for ST in $STATES; do
  echo "=== $ST: extracting $(date +%H:%M:%S) ==="
  unzip -o -j "$GNAF_ZIP" \
    "$PREFIX/${ST}_ADDRESS_DETAIL_psv.psv" \
    "$PREFIX/${ST}_ADDRESS_DEFAULT_GEOCODE_psv.psv" -d "$TMP" >/dev/null || true
  GEO="$TMP/${ST}_ADDRESS_DEFAULT_GEOCODE_psv.psv"
  DET="$TMP/${ST}_ADDRESS_DETAIL_psv.psv"
  if [ ! -f "$GEO" ] || [ ! -f "$DET" ]; then echo "  skip $ST (missing PSV)"; continue; fi
  echo "=== $ST: loading $(date +%H:%M:%S) ==="
  psql "$PGURL" -v ON_ERROR_STOP=1 <<SQL
SET statement_timeout = 0;
CREATE TEMP TABLE g(pid text,lng float8,lat float8);
\copy g FROM PROGRAM 'tail -n +2 "$GEO" | cut -d"|" -f4,6,7' WITH (FORMAT csv, DELIMITER '|');
CREATE TEMP TABLE d(pid text,num text,postcode text);
\copy d FROM PROGRAM 'tail -n +2 "$DET" | cut -d"|" -f1,18,27' WITH (FORMAT csv, DELIMITER '|');
INSERT INTO geo.gnaf_address (gnaf_pid,address_label,lat,lng,state,geom)
SELECT g.pid, coalesce(d.num,'')||' · '||coalesce(d.postcode,''), g.lat, g.lng, '$ST',
       ST_SetSRID(ST_MakePoint(g.lng,g.lat),4326)
FROM g JOIN d ON d.pid=g.pid WHERE g.lat IS NOT NULL
ON CONFLICT (gnaf_pid) DO NOTHING;
SQL
  if [ $? -ne 0 ]; then echo "  ERROR loading $ST" >&2; exit 1; fi
  psql "$PGURL" -tAc "SELECT '  $ST done. gnaf total ' || to_char(count(*),'FM999,999,999') FROM geo.gnaf_address;"
  rm -f "$GEO" "$DET"
done

# ── Build address_region (federal + state; LGA dropped) ──
echo "=== Building address_region $(date +%H:%M:%S) ==="
psql "$PGURL" -v ON_ERROR_STOP=1 <<'SQL'
\timing on
SET statement_timeout = 0;
TRUNCATE geo.address_region;
INSERT INTO geo.address_region (gnaf_pid, mb_code, sa1_code, sa2_code, sa3_code, sa4_code, lga_code)
SELECT a.gnaf_pid, a.mb_code, m.sa1_code, m.sa2_code, m.sa3_code, m.sa4_code, m.lga_code
FROM geo.gnaf_address a
LEFT JOIN geo.meshblock m ON m.mb_code = a.mb_code;

BEGIN;
SET LOCAL work_mem = '512MB';
UPDATE geo.address_region ar SET ced_code = p.code
FROM (SELECT a.gnaf_pid, d.code FROM geo.ced d JOIN geo.gnaf_address a ON ST_Contains(d.geom, a.geom)) p
WHERE p.gnaf_pid = ar.gnaf_pid;
COMMIT;

BEGIN;
SET LOCAL work_mem = '512MB';
UPDATE geo.address_region ar SET sed_code = p.code
FROM (SELECT a.gnaf_pid, d.code FROM geo.sed d JOIN geo.gnaf_address a ON ST_Contains(d.geom, a.geom)) p
WHERE p.gnaf_pid = ar.gnaf_pid;
COMMIT;

DELETE FROM geo.dataset_meta WHERE key = 'lga';
UPDATE geo.dataset_meta SET row_count=(SELECT count(*) FROM geo.gnaf_address), status='loaded', last_ingested=now(), updated_at=now() WHERE key='gnaf';
UPDATE geo.dataset_meta SET row_count=(SELECT count(*) FROM geo.ced), status='loaded', last_ingested=now(), updated_at=now() WHERE key='ced';
UPDATE geo.dataset_meta SET row_count=(SELECT count(*) FROM geo.sed), status='loaded', last_ingested=now(), updated_at=now() WHERE key='sed';
SQL

# ── Verify ──
echo "=== Result $(date +%H:%M:%S) ==="
psql "$PGURL" -tAc "SELECT 'gnaf=' || to_char(count(*),'FM999,999,999') FROM geo.gnaf_address;"
psql "$PGURL" -tAc "SELECT 'mapped total=' || to_char(count(*),'FM999,999,999') || '  ced=' || to_char(count(ced_code),'FM999,999,999') || '  sed=' || to_char(count(sed_code),'FM999,999,999') FROM geo.address_region;"
echo "ACT federal divisions (sanity — expect Canberra ~107k / Bean ~90k / Fenner ~85k):"
psql "$PGURL" -tAc "SELECT c.name || ' ' || to_char(count(*),'FM999,999,999') FROM geo.address_region ar JOIN geo.ced c ON c.code=ar.ced_code JOIN geo.gnaf_address a ON a.gnaf_pid=ar.gnaf_pid WHERE a.state='ACT' GROUP BY c.name ORDER BY count(*) DESC;"
echo "=== DONE $(date +%H:%M:%S) ==="
