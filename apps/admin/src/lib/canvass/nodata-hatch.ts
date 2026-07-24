/**
 * "Not enough data" treatment for the choropleth/heat maps: a diagonal cross-hatch pattern
 * (plus a dashed outline) laid over no-data regions, so they read as unmeasured rather than as
 * a low scale value — necessary now the sequential ramp's low end is grey.
 *
 * Mapbox `fill-color` and `fill-pattern` can't coexist in one paint, so each map draws a second
 * fill layer with `fill-pattern: NODATA_HATCH_ID` over the no-data features (see the `*NoDataFilter`
 * helpers beside each fill builder), plus a dashed line layer using {@link NODATA_OUTLINE_PAINT}.
 */

/** The registered pattern-image id, referenced by each map's `fill-pattern`. */
export const NODATA_HATCH_ID = "nodata-hatch";

/** A pattern image in the shape Mapbox `addImage` accepts (no canvas/DOM needed). */
export type HatchImage = { width: number; height: number; data: Uint8ClampedArray };

/**
 * Build the tiling cross-hatch as raw RGBA pixels — diagonal grey lines on a transparent field.
 * Mid-slate at high alpha reads over any fill and on both light and dark basemaps. Pure (no
 * canvas/`ImageData`) so it's unit-testable and construction is deterministic.
 */
export function buildHatchImage(size = 8, period = 4, lineWidth = 1.4): HatchImage {
  const data = new Uint8ClampedArray(size * size * 4);
  const r = 100;
  const g = 116;
  const b = 139; // slate-500-ish
  const a = 235; // ~0.92
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Two offset diagonals give an even cross-hatch that tiles seamlessly.
      const on = (x + y) % period < lineWidth || (x - y + size) % period < lineWidth;
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = on ? a : 0;
    }
  }
  return { width: size, height: size, data };
}

/** The minimal Mapbox map surface this needs — kept structural so callers pass `map.getMap()`. */
type MapImageHost = {
  hasImage: (id: string) => boolean;
  addImage: (id: string, image: HatchImage, options?: { pixelRatio?: number }) => void;
};

/** Register the hatch pattern on a map once (idempotent). Call from the map's `onLoad`. */
export function ensureNoDataHatch(map: MapImageHost): void {
  if (map.hasImage(NODATA_HATCH_ID)) return;
  map.addImage(NODATA_HATCH_ID, buildHatchImage(), { pixelRatio: 2 });
}

/** Dashed outline for no-data areas — a muted mid-slate that reads on both themes. Mapbox paint
 *  needs a literal colour (it can't read CSS tokens), so this is a fixed neutral. */
export const NODATA_OUTLINE_PAINT = {
  "line-color": "#64748b",
  "line-width": 1.1,
  "line-opacity": 0.85,
  "line-dasharray": [2, 2] as [number, number],
};

/** The CSS hatch used by the legend swatches, so the key matches the map. */
export const NODATA_HATCH_CSS =
  "repeating-linear-gradient(45deg, #64748b 0 1.2px, transparent 1.2px 4px)";
