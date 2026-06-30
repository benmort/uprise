#!/usr/bin/env bash
# Backfill geo.gnaf_address.mb_code from G-NAF's own mesh-block linkage, so geo:map
# can nest SA1–SA4 onto every address (parity with CED/SED). Use when addresses are
# already loaded but mb_code is NULL — load-prod.sh historically didn't populate it.
# Re-runnable + idempotent. After this completes, run `geo:map` to rebuild
# geo.address_region (SA1–4 then populate deterministically from geo.meshblock).
#
# G-NAF linkage (per state): ADDRESS_DETAIL_PID → MB_2021_PID (ADDRESS_MESH_BLOCK_2021)
# → MB_2021_CODE (MB_2021). gnaf_address.gnaf_pid IS the ADDRESS_DETAIL_PID.
#
# Env (same shape as load-prod.sh):
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

# Preflight: meshblock geometry should be loaded (geo:load-boundaries) so the codes resolve.
MB=$(psql "$PGURL" -tAc "SELECT count(*) FROM geo.meshblock;")
echo "geo.meshblock rows: ${MB:-0}"

for ST in $STATES; do
  echo "=== $ST: mesh-block backfill $(date +%H:%M:%S) ==="
  unzip -o -j "$GNAF_ZIP" \
    "$PREFIX/${ST}_ADDRESS_MESH_BLOCK_2021_psv.psv" \
    "$PREFIX/${ST}_MB_2021_psv.psv" -d "$TMP" >/dev/null || true
  AMB="$TMP/${ST}_ADDRESS_MESH_BLOCK_2021_psv.psv"
  MBC="$TMP/${ST}_MB_2021_psv.psv"
  if [ ! -f "$AMB" ] || [ ! -f "$MBC" ]; then echo "  skip $ST (missing PSV)"; continue; fi
  psql "$PGURL" -v ON_ERROR_STOP=1 <<SQL
SET statement_timeout = 0;
-- ADDRESS_MESH_BLOCK_2021: f4=ADDRESS_DETAIL_PID, f6=MB_2021_PID
CREATE TEMP TABLE amb(adpid text, mbpid text);
\copy amb FROM PROGRAM 'tail -n +2 "$AMB" | cut -d"|" -f4,6' WITH (FORMAT csv, DELIMITER '|');
-- MB_2021: f1=MB_2021_PID, f4=MB_2021_CODE
CREATE TEMP TABLE mb(mbpid text, code text);
\copy mb FROM PROGRAM 'tail -n +2 "$MBC" | cut -d"|" -f1,4' WITH (FORMAT csv, DELIMITER '|');
CREATE INDEX ON amb(adpid);
UPDATE geo.gnaf_address a SET mb_code = mb.code
FROM amb JOIN mb ON mb.mbpid = amb.mbpid
WHERE a.gnaf_pid = amb.adpid AND a.mb_code IS DISTINCT FROM mb.code;
SQL
  if [ $? -ne 0 ]; then echo "  ERROR $ST" >&2; exit 1; fi
  psql "$PGURL" -tAc "SELECT '  $ST: gnaf with mb_code = ' || to_char(count(mb_code),'FM999,999,999') || ' / ' || to_char(count(*),'FM999,999,999') FROM geo.gnaf_address WHERE state='$ST';"
  rm -f "$AMB" "$MBC"
done

echo "=== Result $(date +%H:%M:%S) ==="
psql "$PGURL" -tAc "SELECT 'gnaf with mb_code = ' || to_char(count(mb_code),'FM999,999,999') || ' / ' || to_char(count(*),'FM999,999,999') FROM geo.gnaf_address;"
echo "Now run geo:map to rebuild geo.address_region (SA1–4 populate from geo.meshblock)."
