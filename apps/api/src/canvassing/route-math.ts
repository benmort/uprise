/**
 * Route ordering and distance, server-side.
 *
 * A deliberate twin of `packages/field/src/lib/route.ts`, which is the volunteer PWA's
 * offline copy — that one has to run in a service worker with no dependencies and no
 * network. This one runs in the API to price a turf before anyone is assigned to it.
 * They are the same algorithm; neither can import the other (the API does not depend on a
 * React package, and the PWA must not depend on the API). Keep them in step.
 */

export type Stop = { id: string; lat: number; lng: number };

const EARTH_M = 6_371_000;

/** Great-circle metres between two points. */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Total metres along an already-ordered route. */
export function routeLengthM(stops: Stop[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i++) total += haversineM(stops[i - 1], stops[i]);
  return total;
}

/**
 * Equirectangular distance — proportional to the real one at turf scale, and cheap.
 * Used only for *ordering*, where any monotone approximation will do. Every metre that
 * reaches an estimate comes from {@link haversineM} or from Mapbox.
 */
function planar(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = a.lat - b.lat;
  const dLng = (a.lng - b.lng) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

function nearestNeighbour(stops: Stop[], startIndex: number): Stop[] {
  const remaining = stops.slice();
  const [start] = remaining.splice(startIndex, 1);
  const ordered = [start];

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = planar(last, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    ordered.push(remaining.splice(best, 1)[0]);
  }
  return ordered;
}

/**
 * Above this many stops, 2-opt is skipped and the nearest-neighbour order stands.
 *
 * 2-opt is O(n²) per pass even with an incremental delta, and a turf can hold tens of
 * thousands of buildings — Kew holds 28,580. A slightly worse order costs a few percent
 * of walking time in a forecast; an estimator that never returns costs everything.
 */
const TWO_OPT_MAX_STOPS = 2_000;

/**
 * Nearest-neighbour construction, then 2-opt until no reversal helps.
 *
 * The 2-opt gain is evaluated as a **delta over the four edges a reversal touches**, not
 * by re-measuring the whole tour. Re-measuring makes each pass O(n³) and turns a 250-stop
 * turf into fifteen million distance computations.
 */
export function optimiseRoute(stops: Stop[], start?: { lat: number; lng: number }, maxPasses = 8): Stop[] {
  if (stops.length < 3) return stops.slice();

  // Begin at whichever stop is closest to the start point (a volunteer's meeting spot).
  let startIndex = 0;
  if (start) {
    let best = Infinity;
    stops.forEach((s, i) => {
      const d = planar(start, s);
      if (d < best) {
        best = d;
        startIndex = i;
      }
    });
  }

  const route = nearestNeighbour(stops, startIndex);
  if (route.length > TWO_OPT_MAX_STOPS) return route;

  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (let i = 1; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const a = route[i - 1];
        const b = route[i];
        const c = route[k];
        const d = route[k + 1]; // undefined at the tail — that edge simply does not exist
        const before = planar(a, b) + (d ? planar(c, d) : 0);
        const after = planar(a, c) + (d ? planar(b, d) : 0);
        if (after < before - 1e-12) {
          // Reverse i..k in place; the two edges either side are the only ones affected.
          for (let lo = i, hi = k; lo < hi; lo++, hi--) [route[lo], route[hi]] = [route[hi], route[lo]];
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return route;
}
