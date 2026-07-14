import type { ExpressionSpecification } from "mapbox-gl";
import type { PollPalette } from "@/lib/insights/palette";
import type { DensityBand } from "@/lib/canvass/density";
import type { AbsChoroplethRow } from "@/lib/api/demographics";

/**
 * Painting an ABS indicator on the shared geo map. The value reaches the map two ways, chosen by
 * level: client `["match", ["get","code"], …]` at SA2+ (rows in hand, ≤2,600 features — the
 * referendum mechanism), or a `["step", ["get","value"], …]` on a value baked onto the tile at
 * SA1/meshblock (60k/360k features — the density mechanism). Both bucket the value against the
 * same national quantile `breaks` and share one ramp, so a colour means the same thing either way.
 */

/** Diverging ramp for a polarity indicator (advantage/disadvantage), sequential for magnitude. */
export function rampFor(polarity: string, palette: PollPalette): readonly string[] {
  return polarity && polarity !== "neutral" ? palette.diverging : palette.seq;
}

/** Strictly-ascending, de-duped breaks — Mapbox `["step"]` throws on equal/decreasing stops. */
export function toStops(breaks: number[]): number[] {
  const asc = breaks.filter((b) => Number.isFinite(b)).sort((a, b) => a - b);
  return asc.filter((b, i) => i === 0 || b > asc[i - 1]);
}

/** Bucket a value into 0..stops.length (the ramp index) against ascending break stops. */
export function bucketOf(value: number, stops: number[]): number {
  let i = 0;
  while (i < stops.length && value >= stops[i]) i += 1;
  return i;
}

/** Client-join fill (SA2+): tint each region by its indicator value via `["match", code, …]`. */
export function matchFill(
  rows: AbsChoroplethRow[],
  breaks: number[],
  ramp: readonly string[],
  nodata: string,
): ExpressionSpecification | string {
  const stops = toStops(breaks);
  if (stops.length === 0) return nodata;
  const pairs: string[] = [];
  for (const r of rows) {
    if (r.value !== null && Number.isFinite(r.value)) {
      pairs.push(r.code, ramp[Math.min(bucketOf(r.value, stops), ramp.length - 1)]);
    }
  }
  if (pairs.length === 0) return nodata;
  return ["match", ["get", "code"], ...pairs, nodata] as unknown as ExpressionSpecification;
}

/** Tile-baked fill (SA1/meshblock): colour the feature's `value` property by a step scale. */
export function stepFill(
  breaks: number[],
  ramp: readonly string[],
  nodata: string,
): ExpressionSpecification | string {
  const stops = toStops(breaks);
  if (stops.length === 0) return nodata;
  const step: unknown[] = ["step", ["get", "value"], ramp[0]];
  stops.forEach((stop, i) => step.push(stop, ramp[Math.min(i + 1, ramp.length - 1)]));
  // A feature with no baked value reads back null → no-data, not the bottom band.
  return ["case", ["==", ["get", "value"], null], nodata, step] as unknown as ExpressionSpecification;
}

/** SequentialLegend bands from the scale (first band starts at the layer min, top is open-ended). */
export function choroplethBands(breaks: number[], min: number | null, ramp: readonly string[]): DensityBand[] {
  const stops = toStops(breaks);
  if (stops.length === 0) return [];
  const lows = [min ?? 0, ...stops];
  return lows.map((lo, i) => ({
    lo,
    hi: i < stops.length ? stops[i] : null,
    colour: ramp[Math.min(i, ramp.length - 1)],
  }));
}

/** Format a band boundary by the indicator's unit — the legend's axis labels. */
export function formatIndicator(value: number, unit: string): string {
  switch (unit) {
    case "percent":
      return `${value % 1 === 0 ? value : value.toFixed(1)}%`;
    case "aud":
      return value >= 1000 ? `$${Math.round(value).toLocaleString()}` : `$${Math.round(value)}`;
    case "years":
      return `${Math.round(value)}`;
    case "decile":
    case "ordinal":
      return String(Math.round(value));
    default:
      return value >= 1000 ? Math.round(value).toLocaleString() : String(Math.round(value * 10) / 10);
  }
}
