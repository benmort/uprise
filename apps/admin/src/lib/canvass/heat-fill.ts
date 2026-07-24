import type { ExpressionSpecification, FilterSpecification } from "mapbox-gl";
import type { HeatCell, HeatFactor } from "@/lib/api/campaigns";

/**
 * Painting the canvass targeting heat map (the SA1 "where to knock" score) onto the
 * shared geo map. A run's cells arrive client-side (200–3,000 SA1s per boundary), so
 * the fill is a client-join `["match", ["get","code"], …]` — the demographics SA2+
 * mechanism — over the SA1 vector tiles. Cells are banded server-side (1–5 within-
 * boundary quantiles); band 5 is hottest. A null score means "insufficient data":
 * painted the no-data colour at the lowest alpha — never cold — mirroring SEIFA's own
 * low-denominator exclusion rule.
 *
 * Confidence rides as opacity (value-by-alpha): three alpha bins from how complete a
 * cell's inputs are, so a strong-but-thin cell visibly whispers rather than shouts.
 */

/** The factor groups in the API's stable weight-key order. The last three are
 *  opt-in signals — weight 0 in every preset until a slider moves. */
export const HEAT_FACTORS: readonly HeatFactor[] = [
  "doors",
  "persuadability",
  "supporter",
  "fit",
  "efficiency",
  "freshness",
  "community",
  "progressive",
  "informality",
];

/** Human labels for the factor groups (sliders, coverage bars, contribution bars). */
export const HEAT_FACTOR_LABELS: Record<HeatFactor, string> = {
  doors: "Doors",
  persuadability: "Persuadability",
  supporter: "Supporter density",
  fit: "Demographic fit",
  efficiency: "Walkability",
  freshness: "Coverage freshness",
  community: "Multicultural communities",
  progressive: "Progressive baseline (Voice 2023)",
  informality: "Informal-vote risk",
};

/** Band → ACTION labels, band 1 (coldest) first: index = band − 1. Band 5 = hottest. */
export const HEAT_BAND_LABELS = ["Skip – no data", "Low", "Moderate", "Strong", "Knock first"] as const;

/** The action label for a cell's band; a null band (insufficient data) reads as no data. */
export function heatBandLabel(band: number | null): string {
  if (band === null || band < 1 || band > HEAT_BAND_LABELS.length) return "No data";
  return HEAT_BAND_LABELS[band - 1];
}

/**
 * Client-join fill: tint each scored SA1 by its band's ramp colour via
 * `["match", ["get","code"], …]`. Null-score cells take the no-data colour — their
 * "hatched" treatment is that colour at the floor alpha from {@link heatOpacity},
 * so they read as unknown, never as cold. The match fallback is also no-data; pair
 * the layer with {@link heatFilter} and the zero-alpha opacity fallback so SA1s
 * outside the run never actually paint.
 */
export function heatFill(
  cells: HeatCell[],
  ramp: readonly string[],
  nodata: string,
): ExpressionSpecification | string {
  const pairs: string[] = [];
  const seen = new Set<string>();
  for (const c of cells) {
    if (!c.sa1Code || seen.has(c.sa1Code)) continue; // ["match"] throws on duplicate labels
    seen.add(c.sa1Code);
    const colour =
      c.score !== null && c.band !== null && c.band >= 1
        ? ramp[Math.min(c.band - 1, ramp.length - 1)]
        : nodata;
    pairs.push(c.sa1Code, colour);
  }
  if (pairs.length === 0) return nodata;
  return ["match", ["get", "code"], ...pairs, nodata] as unknown as ExpressionSpecification;
}

/** The three confidence alpha bins, low → high. */
export const HEAT_ALPHAS = [0.35, 0.6, 0.85] as const;

/**
 * A cell's confidence in 0–1: half from how many of the factor groups had data, half
 * from its doors sub-score (the within-boundary doors rank — few doors is both a thin
 * sample and little to knock). Null-score cells are floor confidence by definition.
 */
export function heatConfidence(cell: HeatCell): number {
  if (cell.score === null) return 0;
  const factorShare = cell.available.length / HEAT_FACTORS.length;
  const doorsRank = Math.max(0, Math.min(1, cell.subScores.doors ?? 0));
  return factorShare * 0.5 + doorsRank * 0.5;
}

/** The alpha bin one cell paints at. */
export function heatCellAlpha(cell: HeatCell): number {
  if (cell.score === null) return HEAT_ALPHAS[0];
  const confidence = heatConfidence(cell);
  if (confidence >= 0.7) return HEAT_ALPHAS[2];
  if (confidence >= 0.4) return HEAT_ALPHAS[1];
  return HEAT_ALPHAS[0];
}

/**
 * Value-by-alpha opacity expression paired with {@link heatFill}: three confidence
 * bins; null-score (no-data) cells sit in the lowest. The fallback is 0, so every
 * SA1 outside the run stays invisible even before the layer filter applies.
 */
export function heatOpacity(cells: HeatCell[]): ExpressionSpecification | number {
  const pairs: Array<string | number> = [];
  const seen = new Set<string>();
  for (const c of cells) {
    if (!c.sa1Code || seen.has(c.sa1Code)) continue;
    seen.add(c.sa1Code);
    pairs.push(c.sa1Code, heatCellAlpha(c));
  }
  if (pairs.length === 0) return 0;
  return ["match", ["get", "code"], ...pairs, 0] as unknown as ExpressionSpecification;
}

/** Restrict the heat layer to the run's SA1s; undefined when there is nothing to paint. */
export function heatFilter(cells: HeatCell[]): FilterSpecification | undefined {
  const codes = [...new Set(cells.map((c) => c.sa1Code).filter(Boolean))];
  if (codes.length === 0) return undefined;
  return ["in", ["get", "code"], ["literal", codes]] as FilterSpecification;
}

/** The run's insufficient-data SA1s (null score/band) — the hatch-overlay filter. Undefined
 *  when every scored cell has a band, so no hatch layer is added. */
export function heatNoDataFilter(cells: HeatCell[]): FilterSpecification | undefined {
  const codes = [
    ...new Set(
      cells
        .filter((c) => c.sa1Code && (c.score === null || c.band === null || c.band < 1))
        .map((c) => c.sa1Code),
    ),
  ];
  if (codes.length === 0) return undefined;
  return ["in", ["get", "code"], ["literal", codes]] as FilterSpecification;
}

export type HeatLegendBand = {
  /** Band number 1–5. */
  band: number;
  label: string;
  colour: string;
  /** Score range the band covers; `hi` null on the open-ended top band. */
  lo: number | null;
  hi: number | null;
};

/**
 * Legend rows from the run's within-boundary quantile breaks (4 breaks cut 5 bands).
 * Ranges degrade to null when quantiles collapsed server-side (fewer breaks) — the
 * action labels still render.
 */
export function heatLegendBands(breaks: number[], ramp: readonly string[]): HeatLegendBand[] {
  return HEAT_BAND_LABELS.map((label, i) => ({
    band: i + 1,
    label,
    colour: ramp[Math.min(i, ramp.length - 1)],
    lo: i === 0 ? 0 : Number.isFinite(breaks[i - 1]) ? breaks[i - 1] : null,
    hi: i === HEAT_BAND_LABELS.length - 1 ? null : Number.isFinite(breaks[i]) ? breaks[i] : null,
  }));
}

/**
 * Overlay the evaluation holdout onto a heat fill: holdout SA1s paint a fixed colour
 * regardless of score, so organisers see at a glance where NOT to cut turf. Wraps the
 * base expression in a prior ["match"] on the holdout codes.
 */
export function withHoldoutOverride(
  base: ExpressionSpecification | string,
  holdoutCodes: string[],
  colour: string,
): ExpressionSpecification | string {
  if (holdoutCodes.length === 0) return base;
  return [
    "match",
    ["get", "code"],
    [...new Set(holdoutCodes)],
    colour,
    base,
  ] as unknown as ExpressionSpecification;
}
