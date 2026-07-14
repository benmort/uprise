#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Full G-NAF (all states) → geo.gnaf_address.
#
# Loads the authoritative Australian address universe: for each current (non-retired) PRINCIPAL
# address it composes a readable label ("96 Smith Street, Richmond VIC 3121"), stores the full
# G-NAF detail (unit/level/lot/number parts, street name+type+suffix, confidence, flags …), and
# keeps every reference PID (street-locality, locality, site, property, mesh block) so the address
# stays navigable. UPSERTs by gnaf_pid, so existing Contact.gnafPid + geo.address_region links are
# preserved — never truncated.
#
# Bulk psql (\copy into temp tables + one INSERT…SELECT join per state) because it's ~16.9M rows —
# row-by-row would take hours. Idempotent: re-running replaces each row in place.
#
# G-NAF code note: STREET_TYPE / FLAT_TYPE / LEVEL_TYPE codes are already the full word
# ("ROAD", "UNIT") — used directly. Only STREET_SUFFIX is an abbreviation ("E") and is expanded
# via its authority table ("E" → "East").
#
# Usage:
#   DATABASE_URL="postgresql://…" \
#   GNAF_DIR="/path/to/G-NAF/G-NAF MAY 2026" \
#   bash apps/api/src/scripts/geo/load-gnaf.sh
# GNAF_DIR is the release folder that contains "Standard/" and "Authority Code/".
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL (point it at the target DB deliberately)}"
: "${GNAF_DIR:?set GNAF_DIR to the release dir containing 'Standard' and 'Authority Code'}"

# psql rejects Prisma's ?schema= query param — strip any query string.
PGURL="${DATABASE_URL%%\?*}"
STD="$GNAF_DIR/Standard"
AUT="$GNAF_DIR/Authority Code"
STATES=(ACT NSW NT OT QLD SA TAS VIC WA)

[ -d "$STD" ] || { echo "No Standard/ dir under $GNAF_DIR" >&2; exit 1; }
[ -d "$AUT" ] || { echo "No 'Authority Code/' dir under $GNAF_DIR" >&2; exit 1; }

SQL="$(mktemp -t gnaf-load-XXXX.sql)"
trap 'rm -f "$SQL"' EXIT

# PSVs are pipe-delimited, header row, no quoting — CSV format with a QUOTE char that never occurs
# (SOH, \x01) parses them safely; commas inside fields stay intact.
COPY_OPTS="WITH (FORMAT csv, DELIMITER '|', HEADER true, QUOTE E'\\x01')"

# Street name + type (code is the full word) + suffix (abbrev → expanded via authority NAME).
STREET_EXPR="btrim(concat_ws(' ', initcap(sl.street_name), initcap(sl.street_type_code), initcap(ss.name)))"

{
  echo "SET work_mem = '256MB';"           # favour in-memory hash joins over the 5M-row lookups
  echo "SET synchronous_commit = off;"      # one-off bulk load; per-row durability isn't critical

  echo "CREATE TEMP TABLE aut_suffix (code TEXT, name TEXT, description TEXT);"
  echo "\\copy aut_suffix FROM '${AUT}/Authority_Code_STREET_SUFFIX_AUT_psv.psv' ${COPY_OPTS}"

  cat <<'DDL'
CREATE TEMP TABLE tmp_ad (
  address_detail_pid TEXT, date_created TEXT, date_last_modified TEXT, date_retired TEXT,
  building_name TEXT, lot_number_prefix TEXT, lot_number TEXT, lot_number_suffix TEXT,
  flat_type_code TEXT, flat_number_prefix TEXT, flat_number TEXT, flat_number_suffix TEXT,
  level_type_code TEXT, level_number_prefix TEXT, level_number TEXT, level_number_suffix TEXT,
  number_first_prefix TEXT, number_first TEXT, number_first_suffix TEXT,
  number_last_prefix TEXT, number_last TEXT, number_last_suffix TEXT,
  street_locality_pid TEXT, location_description TEXT, locality_pid TEXT, alias_principal TEXT,
  postcode TEXT, private_street TEXT, legal_parcel_id TEXT, confidence TEXT,
  address_site_pid TEXT, level_geocoded_code TEXT, property_pid TEXT, gnaf_property_pid TEXT,
  primary_secondary TEXT
);
CREATE TEMP TABLE tmp_sl (
  street_locality_pid TEXT, date_created TEXT, date_retired TEXT, street_class_code TEXT,
  street_name TEXT, street_type_code TEXT, street_suffix_code TEXT, locality_pid TEXT,
  gnaf_street_pid TEXT, gnaf_street_confidence TEXT, gnaf_reliability_code TEXT
);
CREATE TEMP TABLE tmp_loc (
  locality_pid TEXT, date_created TEXT, date_retired TEXT, locality_name TEXT,
  primary_postcode TEXT, locality_class_code TEXT, state_pid TEXT, gnaf_locality_pid TEXT,
  gnaf_reliability_code TEXT
);
CREATE TEMP TABLE tmp_state (
  state_pid TEXT, date_created TEXT, date_retired TEXT, state_name TEXT, state_abbreviation TEXT
);
CREATE TEMP TABLE tmp_geo (
  address_default_geocode_pid TEXT, date_created TEXT, date_retired TEXT, address_detail_pid TEXT,
  geocode_type_code TEXT, longitude TEXT, latitude TEXT
);
CREATE TEMP TABLE tmp_amb (
  address_mesh_block_2021_pid TEXT, date_created TEXT, date_retired TEXT, address_detail_pid TEXT,
  mb_match_code TEXT, mb_2021_pid TEXT
);
CREATE TEMP TABLE tmp_mb (
  mb_2021_pid TEXT, date_created TEXT, date_retired TEXT, mb_2021_code TEXT
);
DDL

  for S in "${STATES[@]}"; do
    echo "TRUNCATE tmp_ad, tmp_sl, tmp_loc, tmp_state, tmp_geo, tmp_amb, tmp_mb;"
    echo "\\copy tmp_ad    FROM '${STD}/${S}_ADDRESS_DETAIL_psv.psv' ${COPY_OPTS}"
    echo "\\copy tmp_sl    FROM '${STD}/${S}_STREET_LOCALITY_psv.psv' ${COPY_OPTS}"
    echo "\\copy tmp_loc   FROM '${STD}/${S}_LOCALITY_psv.psv' ${COPY_OPTS}"
    echo "\\copy tmp_state FROM '${STD}/${S}_STATE_psv.psv' ${COPY_OPTS}"
    echo "\\copy tmp_geo   FROM '${STD}/${S}_ADDRESS_DEFAULT_GEOCODE_psv.psv' ${COPY_OPTS}"
    echo "\\copy tmp_amb   FROM '${STD}/${S}_ADDRESS_MESH_BLOCK_2021_psv.psv' ${COPY_OPTS}"
    echo "\\copy tmp_mb    FROM '${STD}/${S}_MB_2021_psv.psv' ${COPY_OPTS}"
    cat <<JOIN
INSERT INTO geo.gnaf_address (
  gnaf_pid, address_label, lat, lng, state, mb_code, geom,
  street, locality, postcode,
  building_name, flat_type, flat_number, level_type, level_number, lot_number,
  number_first, number_last, street_name, street_type, street_suffix,
  location_description, confidence, primary_secondary, alias_principal, private_street, legal_parcel_id,
  street_locality_pid, locality_pid, address_site_pid, property_pid, gnaf_property_pid,
  mb_2021_pid, mb_2021_code
)
SELECT
  ad.address_detail_pid,
  btrim(concat_ws(', ',
    NULLIF(btrim(concat_ws(' ',
      NULLIF(
        CASE WHEN NULLIF(concat(ad.flat_number_prefix, ad.flat_number, ad.flat_number_suffix), '') IS NOT NULL
             THEN COALESCE(initcap(ad.flat_type_code) || ' ', '') || concat(ad.flat_number_prefix, ad.flat_number, ad.flat_number_suffix) || '/'
             ELSE '' END
        || CASE
             WHEN NULLIF(concat(ad.number_first_prefix, ad.number_first, ad.number_first_suffix), '') IS NOT NULL
               THEN concat(ad.number_first_prefix, ad.number_first, ad.number_first_suffix)
                    || COALESCE('-' || NULLIF(concat(ad.number_last_prefix, ad.number_last, ad.number_last_suffix), ''), '')
             WHEN NULLIF(ad.lot_number, '') IS NOT NULL THEN 'Lot ' || ad.lot_number
             ELSE '' END,
      ''),
      ${STREET_EXPR}
    )), ''),
    NULLIF(btrim(concat_ws(' ', initcap(loc.locality_name), st.state_abbreviation, ad.postcode)), '')
  )),
  NULLIF(g.latitude, '')::double precision,
  NULLIF(g.longitude, '')::double precision,
  st.state_abbreviation,
  mb.mb_2021_code,
  CASE WHEN NULLIF(g.longitude,'') IS NOT NULL AND NULLIF(g.latitude,'') IS NOT NULL
       THEN ST_SetSRID(ST_MakePoint(g.longitude::double precision, g.latitude::double precision), 4326) END,
  ${STREET_EXPR},
  initcap(loc.locality_name),
  ad.postcode,
  ad.building_name,
  initcap(ad.flat_type_code),
  NULLIF(concat(ad.flat_number_prefix, ad.flat_number, ad.flat_number_suffix), ''),
  initcap(ad.level_type_code),
  NULLIF(concat(ad.level_number_prefix, ad.level_number, ad.level_number_suffix), ''),
  NULLIF(concat(ad.lot_number_prefix, ad.lot_number, ad.lot_number_suffix), ''),
  NULLIF(concat(ad.number_first_prefix, ad.number_first, ad.number_first_suffix), ''),
  NULLIF(concat(ad.number_last_prefix, ad.number_last, ad.number_last_suffix), ''),
  initcap(sl.street_name),
  initcap(sl.street_type_code),
  initcap(ss.name),
  NULLIF(ad.location_description, ''),
  NULLIF(ad.confidence, '')::int,
  NULLIF(ad.primary_secondary, ''),
  NULLIF(ad.alias_principal, ''),
  NULLIF(ad.private_street, ''),
  NULLIF(ad.legal_parcel_id, ''),
  NULLIF(ad.street_locality_pid, ''),
  NULLIF(ad.locality_pid, ''),
  NULLIF(ad.address_site_pid, ''),
  NULLIF(ad.property_pid, ''),
  NULLIF(ad.gnaf_property_pid, ''),
  NULLIF(amb.mb_2021_pid, ''),
  mb.mb_2021_code
FROM tmp_ad ad
LEFT JOIN tmp_sl sl   ON sl.street_locality_pid = ad.street_locality_pid
LEFT JOIN tmp_loc loc ON loc.locality_pid = ad.locality_pid
LEFT JOIN tmp_state st ON st.state_pid = loc.state_pid
LEFT JOIN tmp_geo g   ON g.address_detail_pid = ad.address_detail_pid
LEFT JOIN tmp_amb amb ON amb.address_detail_pid = ad.address_detail_pid
LEFT JOIN tmp_mb mb   ON mb.mb_2021_pid = amb.mb_2021_pid
LEFT JOIN aut_suffix ss ON ss.code = sl.street_suffix_code
WHERE COALESCE(ad.date_retired, '') = '' AND COALESCE(ad.alias_principal, 'P') = 'P'
ON CONFLICT (gnaf_pid) DO UPDATE SET
  address_label = EXCLUDED.address_label, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
  state = EXCLUDED.state, mb_code = EXCLUDED.mb_code, geom = EXCLUDED.geom,
  street = EXCLUDED.street, locality = EXCLUDED.locality, postcode = EXCLUDED.postcode,
  building_name = EXCLUDED.building_name, flat_type = EXCLUDED.flat_type, flat_number = EXCLUDED.flat_number,
  level_type = EXCLUDED.level_type, level_number = EXCLUDED.level_number, lot_number = EXCLUDED.lot_number,
  number_first = EXCLUDED.number_first, number_last = EXCLUDED.number_last,
  street_name = EXCLUDED.street_name, street_type = EXCLUDED.street_type, street_suffix = EXCLUDED.street_suffix,
  location_description = EXCLUDED.location_description, confidence = EXCLUDED.confidence,
  primary_secondary = EXCLUDED.primary_secondary, alias_principal = EXCLUDED.alias_principal,
  private_street = EXCLUDED.private_street, legal_parcel_id = EXCLUDED.legal_parcel_id,
  street_locality_pid = EXCLUDED.street_locality_pid, locality_pid = EXCLUDED.locality_pid,
  address_site_pid = EXCLUDED.address_site_pid, property_pid = EXCLUDED.property_pid,
  gnaf_property_pid = EXCLUDED.gnaf_property_pid, mb_2021_pid = EXCLUDED.mb_2021_pid,
  mb_2021_code = EXCLUDED.mb_2021_code;
JOIN
    echo "\\echo   loaded ${S}"
  done

  echo "\\echo Done. Total geo.gnaf_address rows:"
  echo "SELECT count(*) FROM geo.gnaf_address;"
} > "$SQL"

echo "Running G-NAF load (all states, ~16.9M addresses — this takes a while)…"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$SQL"
echo "G-NAF load complete."
