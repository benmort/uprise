// Walking-time estimate for a turf / walk-list. `route.ts#routeLength` is degree-based
// (relative ordering only); here we need real metres, so we optimise the order and sum
// haversine leg lengths at a walking pace plus a fixed dwell per door. Fully offline.
import { optimiseRoute, type Stop } from "./route";

const EARTH_M = 6371000;

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(x)));
}

const located = (s: { lat: number; lng: number }) => Number.isFinite(s.lat) && Number.isFinite(s.lng);

/** Total metres along an already-ordered set of stops (haversine; ignores ungeocoded legs). */
export function routeLengthMeters(stops: Stop[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i += 1) {
    if (located(stops[i - 1]) && located(stops[i])) total += haversineM(stops[i - 1], stops[i]);
  }
  return total;
}

export type WalkEstimate = { minutes: number; meters: number; stops: number };

/** Default canvassing pace: 1.3 m/s ≈ 4.7 km/h walking + 60s dwell per door. */
const DEFAULTS = { speedMps: 1.3, dwellSec: 60 };

/** Estimate the walk time for a set of stops (optimises the order first). */
export function estimateWalk(
  stops: Stop[],
  opts: { start?: { lat: number; lng: number }; speedMps?: number; dwellSec?: number } = {},
): WalkEstimate {
  const ordered = optimiseRoute(stops, opts.start);
  const meters = routeLengthMeters(ordered);
  const speed = opts.speedMps ?? DEFAULTS.speedMps;
  const dwell = opts.dwellSec ?? DEFAULTS.dwellSec;
  const seconds = meters / speed + ordered.length * dwell;
  return { minutes: Math.max(0, Math.round(seconds / 60)), meters: Math.round(meters), stops: ordered.length };
}

/** Trim the optimised stop order to the stops that fit a minutes budget (greedy). */
export function trimToBudget(
  stops: Stop[],
  budgetMin: number,
  opts: { start?: { lat: number; lng: number }; speedMps?: number; dwellSec?: number } = {},
): { fit: Stop[]; total: number } {
  const ordered = optimiseRoute(stops, opts.start);
  const speed = opts.speedMps ?? DEFAULTS.speedMps;
  const dwell = opts.dwellSec ?? DEFAULTS.dwellSec;
  const budgetSec = budgetMin * 60;
  const fit: Stop[] = [];
  let sec = 0;
  let prev = opts.start;
  for (const s of ordered) {
    const leg = prev && located(prev) && located(s) ? haversineM(prev, s) / speed : 0;
    const next = sec + leg + dwell;
    if (fit.length > 0 && next > budgetSec) break;
    sec = next;
    fit.push(s);
    prev = s;
  }
  return { fit, total: ordered.length };
}

export type RouteFromHere = { order: Stop[]; savedMetres: number; savedSeconds: number };

// Smallest improvement worth interrupting the volunteer for — below this the current
// route is "good enough" and we stay silent rather than nag.
const MIN_SAVED_METRES = 100;

/**
 * Compare the current walk order against one optimised to START from the volunteer's
 * location. Scores each order as approach (current location → its first stop) + tour
 * length, so "you're standing next to a different stop, start there" is rewarded.
 * Returns the better-from-here order + savings, or null when the gain is below the
 * threshold (or there's nothing to reorder). Pure + offline (haversine).
 */
export function compareRouteFromHere(
  stops: Stop[],
  fix: { lat: number; lng: number },
  currentOrder: Stop[],
  opts: { speedMps?: number } = {},
): RouteFromHere | null {
  if (stops.length < 2) return null;
  const candidate = optimiseRoute(stops, fix);
  const score = (order: Stop[]): number => {
    if (order.length === 0) return 0;
    const approach = located(order[0]) ? haversineM(fix, order[0]) : 0;
    return approach + routeLengthMeters(order);
  };
  const savedMetres = Math.round(score(currentOrder) - score(candidate));
  if (savedMetres < MIN_SAVED_METRES) return null;
  const speed = opts.speedMps ?? DEFAULTS.speedMps;
  return { order: candidate, savedMetres, savedSeconds: Math.round(savedMetres / speed) };
}

/** "45 min" / "1 h 20 min". */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
