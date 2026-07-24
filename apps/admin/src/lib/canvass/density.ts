import type { ExpressionSpecification, FilterSpecification } from "mapbox-gl";

/**
 * Painting address density onto the boundary tiles.
 *
 * The tiles carry a `density` property per feature (addresses per km²), absent where the
 * region's area was never measured. The colour scale comes from the API as four national
 * quantile breaks — quantiles rather than equal-width bands because density is violently
 * skewed: across Australia's LGAs the 20th percentile is 0.4 addresses/km² and the maximum
 * is 9,611, so five equal bands would paint the country one colour.
 */

export type DensityScale = {
  kind: string;
  regions: number;
  min: number | null;
  max: number | null;
  /** Four quantile breaks cutting five bands. Empty before `geo:density` has run. */
  breaks: number[];
};

/**
 * The break values, strictly ascending, with duplicates removed.
 *
 * Mapbox's `["step"]` requires strictly increasing stops and throws otherwise. Quantiles
 * collapse whenever a fifth or more of a layer shares one value — which is exactly what
 * SA1 and mesh block will do once they are published, since parks, water and industrial
 * blocks all sit at zero addresses. Fewer stops simply means fewer bands, which is honest:
 * the data really does not distinguish them.
 */
export function densityStops(breaks: number[]): number[] {
  const ascending = breaks.filter((b) => Number.isFinite(b)).sort((a, b) => a - b);
  return ascending.filter((b, i) => i === 0 || b > ascending[i - 1]);
}

/**
 * A Mapbox paint expression colouring each feature by its density.
 *
 * Returns the flat no-data colour when there is no usable scale — before `geo:density`
 * has run, a layer has no breaks, and the map must say "we don't know" rather than invent
 * a gradient. A feature with no `density` property reads back as null from `["get"]` and
 * takes the same no-data colour: an unmeasured region is not a sparse one.
 */
export function densityFill(
  scale: DensityScale | null,
  seq: readonly string[],
  nodata: string,
): ExpressionSpecification | string {
  const stops = scale ? densityStops(scale.breaks) : [];
  if (stops.length === 0) return nodata;

  // ["step", input, out0, stop1, out1, …] — one more colour than stops.
  const step: unknown[] = ["step", ["get", "density"], seq[0]];
  stops.forEach((stop, i) => step.push(stop, seq[Math.min(i + 1, seq.length - 1)]));

  return ["case", ["==", ["get", "density"], null], nodata, step] as unknown as ExpressionSpecification;
}

/** Features with no measured density → the hatch overlay. `density` is baked on the tile, so
 *  this is a property test (independent of the scale). */
export function densityNoDataFilter(): FilterSpecification {
  return ["==", ["get", "density"], null] as FilterSpecification;
}

export type DensityBand = { lo: number; hi: number | null; colour: string };

/**
 * The legend: one band per colour, `hi === null` on the open-ended top band.
 *
 * `lo` of the first band is the layer's minimum rather than zero — a layer whose sparsest
 * region still holds four addresses per km² should not claim a band starting at nothing.
 */
export function densityBands(scale: DensityScale | null, seq: readonly string[]): DensityBand[] {
  const stops = scale ? densityStops(scale.breaks) : [];
  if (!scale || stops.length === 0) return [];

  const lows = [scale.min ?? 0, ...stops];
  return lows.map((lo, i) => ({
    lo,
    hi: i < stops.length ? stops[i] : null,
    colour: seq[Math.min(i, seq.length - 1)],
  }));
}

/** "0.4", "243", "9,611" — a density, at the precision a reader can use. */
export function formatDensity(v: number): string {
  if (v < 1) return v.toFixed(1);
  if (v < 100) return String(Math.round(v));
  return Math.round(v).toLocaleString();
}
