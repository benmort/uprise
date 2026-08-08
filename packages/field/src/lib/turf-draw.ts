// Geometry for carving turf on a phone. Tap-to-drop-a-corner drawing, not freehand:
// a thumb cannot trace an accurate boundary while walking, and mapbox-gl-draw's polygon
// tool wants a mouse. Everything here is pure so the screen stays a thin renderer, and
// dependency-free (like ./geo) so it runs offline in the installed app.
//
// The server is still the authority — `claimDraw` clips to the campaign boundary and
// subtracts claimed turf. These checks exist to tell a volunteer *before* they claim,
// rather than handing back an "AREA_ALREADY_CLAIMED" after the fact.

import { metresBetween, pointInGeometry, type LngLat, type Ring } from "./geo";

/** Metres per degree of latitude — the local flat-earth projection the area maths uses. */
const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_EQ = 111_320;

/** A repeat tap within this many metres of the last corner is the same corner. */
export const MIN_VERTEX_GAP_M = 3;
/** Below this, the "polygon" is a tap wobble rather than a turf. */
export const MIN_TURF_AREA_SQM = 500;

/**
 * Append a corner, ignoring a double-tap on the one just placed. Returns the same
 * reference when nothing changed so React can skip the re-render.
 */
export function addVertex(ring: Ring, point: LngLat, minGapM = MIN_VERTEX_GAP_M): Ring {
  const last = ring[ring.length - 1];
  if (last) {
    const gap = metresBetween({ lng: last[0], lat: last[1] }, { lng: point[0], lat: point[1] });
    if (gap < minGapM) return ring;
  }
  return [...ring, point];
}

/** Drop the last corner. */
export function undoVertex(ring: Ring): Ring {
  return ring.length === 0 ? ring : ring.slice(0, -1);
}

/** Do segments a1→a2 and b1→b2 cross? Shared endpoints don't count (adjacent edges). */
export function segmentsCross(a1: LngLat, a2: LngLat, b1: LngLat, b2: LngLat): boolean {
  const side = (p: LngLat, q: LngLat, r: LngLat) => {
    const v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return v > 0 ? 1 : v < 0 ? -1 : 0;
  };
  const shares = (p: LngLat, q: LngLat) => p[0] === q[0] && p[1] === q[1];
  if (shares(a1, b1) || shares(a1, b2) || shares(a2, b1) || shares(a2, b2)) return false;
  const d1 = side(a1, a2, b1);
  const d2 = side(a1, a2, b2);
  const d3 = side(b1, b2, a1);
  const d4 = side(b1, b2, a2);
  return d1 !== d2 && d3 !== d4;
}

/** True when no two edges of the (implicitly closed) ring cross — a figure-of-eight turf
 *  is not a turf, and PostGIS would quietly repair it into something unrecognisable. */
export function ringIsSimple(ring: Ring): boolean {
  if (ring.length < 4) return true; // a triangle can't self-cross
  const edges: Array<[LngLat, LngLat]> = ring.map((p, i) => [p, ring[(i + 1) % ring.length]!]);
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const [a1, a2] = edges[i]!;
      const [b1, b2] = edges[j]!;
      if (segmentsCross(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

/** Ring area in square metres, via the shoelace formula in a local flat projection
 *  (exact enough at turf scale, where the earth's curvature is a rounding error).
 *  The projection is anchored on the ring's MEAN latitude, not its first corner, so the
 *  answer doesn't drift when the same shape is drawn starting from a different corner. */
export function ringAreaSqM(ring: Ring): number {
  if (ring.length < 3) return 0;
  const lng0 = ring[0]![0];
  const lat0 = ring.reduce((n, p) => n + p[1], 0) / ring.length;
  const mPerDegLng = M_PER_DEG_LNG_EQ * Math.cos((lat0 * Math.PI) / 180);
  let twiceArea = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const ax = (a[0] - lng0) * mPerDegLng;
    const ay = (a[1] - lat0) * M_PER_DEG_LAT;
    const bx = (b[0] - lng0) * mPerDegLng;
    const by = (b[1] - lat0) * M_PER_DEG_LAT;
    twiceArea += ax * by - bx * ay;
  }
  return Math.abs(twiceArea) / 2;
}

/** "0.42 km²" once it's big enough to warrant it, else "8,400 m²". */
export function formatArea(sqM: number): string {
  if (sqM >= 100_000) return `${(sqM / 1_000_000).toFixed(2)} km²`;
  return `${Math.round(sqM).toLocaleString()} m²`;
}

/** Close the ring into a GeoJSON Polygon (first point repeated last), or null if there
 *  aren't enough corners to enclose anything. */
export function ringToPolygon(ring: Ring): GeoJSON.Polygon | null {
  if (ring.length < 3) return null;
  return { type: "Polygon", coordinates: [[...ring, ring[0]!]] };
}

/** Why this ring can't be claimed yet, or null when it's good to go. */
export type DrawIssue = "too-few" | "too-small" | "self-crossing" | "outside-boundary";

/**
 * The pre-flight the Claim button reads. `boundary` is the campaign's extent: a corner
 * outside it would be silently clipped away by the server, so say so instead.
 */
export function validateRing(ring: Ring, boundary?: unknown | null): DrawIssue | null {
  if (ring.length < 3) return "too-few";
  if (!ringIsSimple(ring)) return "self-crossing";
  if (ringAreaSqM(ring) < MIN_TURF_AREA_SQM) return "too-small";
  if (boundary && typeof boundary === "object") {
    const geom = boundary as { type: string; coordinates: unknown };
    if (geom.type && geom.coordinates && ring.some((p) => !pointInGeometry(p, geom))) {
      return "outside-boundary";
    }
  }
  return null;
}

/** What to tell the volunteer for each issue — one line, actionable. */
export const DRAW_ISSUE_MESSAGE: Record<DrawIssue, string> = {
  "too-few": "Tap at least three corners to enclose an area.",
  "too-small": "That area is too small to knock — zoom in and mark a bigger block.",
  "self-crossing": "The outline crosses itself. Undo the last corner and go around.",
  "outside-boundary": "Part of this is outside the campaign — it would be trimmed off.",
};

/** Centroid of a polygon-ish geometry's outer ring — the point used to test whether a
 *  statistical area falls inside a drawn turf. */
export function outerRingCentroid(geometry: unknown): LngLat | null {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g?.type || !g.coordinates) return null;
  const ring =
    g.type === "Polygon"
      ? (g.coordinates as LngLat[][])[0]
      : g.type === "MultiPolygon"
        ? (g.coordinates as LngLat[][][])[0]?.[0]
        : null;
  if (!ring || ring.length === 0) return null;
  let lng = 0;
  let lat = 0;
  for (const p of ring) {
    lng += p[0];
    lat += p[1];
  }
  return [lng / ring.length, lat / ring.length];
}

/**
 * Rough door count for a drawn turf: sum the addresses of every statistical area whose
 * centroid falls inside it. Deliberately approximate — an area straddling the outline is
 * counted all-or-nothing — so the screen must label it "≈". The exact count arrives when
 * the turf is cut and its addresses are loaded.
 */
export function doorsInsideRing(
  ring: Ring,
  areas: Array<{ geometry: unknown; properties: { addresses?: number } }>,
): number {
  const polygon = ringToPolygon(ring);
  if (!polygon) return 0;
  let doors = 0;
  for (const a of areas) {
    const c = outerRingCentroid(a.geometry);
    if (c && pointInGeometry(c, polygon)) doors += a.properties.addresses ?? 0;
  }
  return doors;
}


/**
 * The drawn ring's door estimate, and whether it could be priced at all.
 *
 * `areas` is null on a draw-only campaign: the claimable endpoint gates `?layer=` on the AREA
 * mode, so the carve screen never fetches address counts there. Passing `?? []` into
 * doorsInsideRing turned that into a confident 0 — the readout said "Nothing picked yet" beside a
 * real polygon, and the oversize guard (`doors > cap`) could never fire, so a volunteer could
 * carve a turf far beyond a shift's work and be told nothing. An unpriced turf is not a small one;
 * `known: false` says which of the two this is so the screen can word it honestly.
 */
export function drawDoorEstimate(
  ring: Ring,
  areas: Array<{ geometry: unknown; properties: { addresses?: number } }> | null | undefined,
): { doors: number; known: boolean } {
  if (!areas) return { doors: 0, known: false };
  return { doors: doorsInsideRing(ring, areas), known: true };
}
