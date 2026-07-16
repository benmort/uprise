// Moonlit-night tint for the dark base map. Mapbox's `dark-v11` renders a near-black,
// low-contrast ground; canvassers found it too flat. We repaint the BASE layers — ground,
// parks, buildings, roads, water and admin borders — into a richer, more vibrant moonlit
// palette so areas read as distinct. Only Mapbox's own base layers are touched (matched by
// their standard id patterns + layer type); our overlay layers (turf, boundaries, choropleth,
// stops, routes) have their own ids and never match, so legends and brand colours are safe —
// and DOM markers/controls sit outside the canvas entirely. Applied at runtime after the style
// loads, so it costs nothing for the light theme and needs no custom Mapbox style.

/** The moonlit palette — a cohesive blue night with distinct greens, water, roads and buildings. */
const MOONLIT = {
  background: "#0f1a33", // deep navy ground
  land: "#15233f",
  landuse: "#1b2b4e", // residential/commercial land — a touch lifted from bare land
  green: "#123f34", // parks, woods, grass — moonlit teal-green
  building: "#28375f", // buildings pop against the land
  water: "#2554b3", // vivid moonlit blue
  waterway: "#3f6fd0",
  road: "#41568c", // streets — legible slate-blue
  roadMajor: "#6f86c8", // motorways/arterials brighter, so the network reads
  admin: "#8093d6", // state/country borders
} as const;

/** Minimal structural view of the bits of a Mapbox GL map we touch (keeps this unit-testable).
 *  Method syntax (not arrow properties) so the real map's stricter paint-property union stays
 *  assignable to these looser signatures. */
export type MoonlitMap = {
  getStyle(): { layers?: Array<{ id: string; type: string }> } | undefined;
  setPaintProperty(id: string, prop: string, value: unknown): void;
  on(event: string, cb: () => void): void;
};

/** Which fill colour a base layer id should take (null = not a base fill we recolour). */
function fillColour(id: string): string | null {
  if (/water/.test(id)) return MOONLIT.water;
  if (/park|grass|wood|forest|scrub|glacier|pitch|golf|cemetery|landcover|national|vegetation/.test(id))
    return MOONLIT.green;
  if (/building/.test(id)) return MOONLIT.building;
  if (/landuse|hillshade/.test(id)) return MOONLIT.landuse;
  if (/^land$|land-|earth/.test(id)) return MOONLIT.land;
  return null;
}

/** Which line colour a base layer id should take (null = not a base line we recolour). */
function lineColour(id: string): string | null {
  if (/waterway|water/.test(id)) return MOONLIT.waterway;
  if (/motorway|trunk/.test(id)) return MOONLIT.roadMajor;
  if (/road|street|bridge|tunnel|primary|secondary|tertiary|service|track|path|pedestrian|rail|transit|ferry/.test(id))
    return MOONLIT.road;
  if (/admin/.test(id)) return MOONLIT.admin;
  return null;
}

/**
 * Repaint the base ground/parks/roads/water/borders to the moonlit palette. No-op unless
 * `theme` is "dark". Walks the live style and matches Mapbox's own base layers by id + type,
 * so a missing or renamed layer is simply skipped rather than throwing, and our overlay layers
 * (whose ids don't match these base patterns) are left alone. Idempotent.
 */
export function applyMoonlitDark(map: MoonlitMap, theme: string): void {
  if (theme !== "dark") return;
  const layers = map.getStyle()?.layers;
  if (!layers) return;
  for (const layer of layers) {
    const id = layer.id ?? "";
    try {
      if (layer.type === "background") {
        map.setPaintProperty(id, "background-color", MOONLIT.background);
      } else if (layer.type === "fill") {
        const color = fillColour(id);
        if (color) map.setPaintProperty(id, "fill-color", color);
      } else if (layer.type === "line") {
        const color = lineColour(id);
        if (color) map.setPaintProperty(id, "line-color", color);
      }
    } catch {
      // A layer that doesn't accept this paint prop (unusual data-driven paint) — skip it.
    }
  }
}

/**
 * Apply the moonlit tint now and again on every future style load (a theme toggle swaps the
 * Mapbox style without remounting, firing `style.load`). `getTheme` is read at apply time so
 * the tint follows the live theme. Call once from a map's `onLoad`.
 */
export function installMoonlitDark(map: MoonlitMap, getTheme: () => string): void {
  const apply = () => applyMoonlitDark(map, getTheme());
  apply();
  map.on("style.load", apply);
}
