/**
 * geoKind/areaType → the `geo.address_region` column that carries a contact's
 * code for that layer. An ALLOWLIST: the key is interpolated into raw SQL, so
 * only these validated column names are ever spliced in (never raw clause
 * input). Shared by the legacy clause evaluator and the v2 leaf resolver.
 */
export const GEO_REGION_COLUMN: Record<string, string> = {
  ced: "ced_code",
  sed: "sed_code",
  sed_lower: "sed_lower_code",
  sed_upper: "sed_upper_code",
  lga: "lga_code",
  ward: "ward_code",
  sa1: "sa1_code",
  sa2: "sa2_code",
  sa3: "sa3_code",
  sa4: "sa4_code",
};
