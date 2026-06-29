// Offline walk-list route ordering. The server uses the Mapbox Optimization API
// for the canonical order at walk-list-build time; this is the client-side
// fallback used offline and for lists beyond the Optimization API's stop limit.
// Nearest-neighbour construction + 2-opt improvement — good enough for walking a
// turf and runs fully offline with no dependencies.

export type Stop = { id: string; lat: number; lng: number };

// Equirectangular approximation — fine at turf scale, no trig-heavy haversine
// needed for *relative* ordering.
function dist(a: Stop, b: Stop): number {
  const dLat = a.lat - b.lat;
  const dLng = (a.lng - b.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function routeLength(stops: Stop[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i += 1) total += dist(stops[i - 1], stops[i]);
  return total;
}

function nearestNeighbour(stops: Stop[], startIndex: number): Stop[] {
  const remaining = stops.slice();
  const [start] = remaining.splice(startIndex, 1);
  const ordered: Stop[] = [start];
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const d = dist(last, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

function twoOpt(route: Stop[]): Stop[] {
  let best = route;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 1; i += 1) {
      for (let k = i + 1; k < best.length; k += 1) {
        const candidate = best
          .slice(0, i)
          .concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        if (routeLength(candidate) + 1e-12 < routeLength(best)) {
          best = candidate;
          improved = true;
        }
      }
    }
  }
  return best;
}

/**
 * Order stops into a short walking route, starting from `start` if given (the
 * volunteer's current position). Stops without coordinates are appended in their
 * original order at the end.
 */
export function optimiseRoute(stops: Stop[], start?: { lat: number; lng: number }): Stop[] {
  const located = stops.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  const unlocated = stops.filter((s) => !Number.isFinite(s.lat) || !Number.isFinite(s.lng));
  if (located.length <= 2) return [...located, ...unlocated];

  // Start nearest to the volunteer's position when provided.
  let startIndex = 0;
  if (start) {
    let bestDist = Infinity;
    located.forEach((s, i) => {
      const d = dist({ id: "_start", ...start }, s);
      if (d < bestDist) {
        bestDist = d;
        startIndex = i;
      }
    });
  }

  return [...twoOpt(nearestNeighbour(located, startIndex)), ...unlocated];
}
