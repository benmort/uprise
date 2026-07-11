import type { ExpressionSpecification } from "mapbox-gl";
import type { ReferendumRow } from "@/lib/api/geo";

/**
 * Painting the 2023 referendum choropleth on the shared geo map.
 *
 * The boundary tiles carry only a region `code`, not the Yes share, so — unlike the address
 * density choropleth, whose value rides on the tile — the fill is a client-side `["match", code,
 * …]` built from the referendum rows. Yes/No is a polarity, so the ramp is the validated diverging
 * scale centred on 50%: blue where Yes led, red where No led, neutral for a near-even split.
 */

/** The five diverging bands, coarse→fine, as [minYesPct, paletteIndex]. */
const BANDS: Array<[number, number]> = [
  [55, 0], // strong Yes
  [52, 1], // lean Yes
  [48, 2], // near-even
  [45, 3], // lean No
  [0, 4], // strong No
];

/** Diverging colour for a region's Yes share (0–100), from a 5-stop diverging ramp. */
export function yesColour(yesPct: number, diverging: readonly string[]): string {
  const band = BANDS.find(([min]) => yesPct >= min) ?? BANDS[BANDS.length - 1];
  return diverging[band[1]];
}

/**
 * A mapbox `["match", ["get","code"], code, colour, …, fallback]` that tints each region's
 * boundary by its Yes share. Regions with no result (unmatched code, or an abolished division)
 * fall through to `nodata`. Returns the bare `nodata` colour when there's nothing to paint.
 */
export function referendumFill(
  rows: ReferendumRow[],
  diverging: readonly string[],
  nodata: string,
): ExpressionSpecification | string {
  const pairs: string[] = [];
  for (const r of rows) {
    if (r.geoCode && typeof r.yesPct === "number") pairs.push(r.geoCode, yesColour(r.yesPct, diverging));
  }
  if (pairs.length === 0) return nodata;
  return ["match", ["get", "code"], ...pairs, nodata] as unknown as ExpressionSpecification;
}

/** Legend swatches for the diverging Yes scale. */
export function referendumBands(diverging: readonly string[]): Array<{ color: string; label: string }> {
  return [
    { color: diverging[0], label: "Yes ≥ 55%" },
    { color: diverging[1], label: "52–55%" },
    { color: diverging[2], label: "48–52%" },
    { color: diverging[3], label: "45–48%" },
    { color: diverging[4], label: "Yes < 45%" },
  ];
}
