import { haversineM, optimiseRoute, routeLengthM, type Stop } from "./route-math";

/**
 * How long it takes to knock a turf.
 *
 * Two things set the answer, and both had to be measured rather than assumed. The first is
 * the walk between buildings: 4.7 m in a Newtown terrace street, 15.9 m across Kew, 47 m in
 * West Wimmera — where the *median* is misleading and the 90th percentile of 1,297 m is what
 * eats the shift. The second is what happens at the door, which no amount of geometry can
 * tell you.
 *
 * Everything in {@link PRIOR_ALLOWANCE} is a prior. `canvass.DoorKnock` carries
 * `volunteerId`, `dispositionCode` and `clientCapturedAt`, so consecutive knocks by one
 * volunteer will one day yield the real seconds per door and the real seconds of walking.
 * It has no rows yet. Until it does, every figure this module produces is a forecast and
 * must be labelled as one.
 */

export type Door = { id: string; lat: number; lng: number };

/** One street address. Units in a block share a coordinate, so they share a building. */
export type Building = { key: string; lat: number; lng: number; doors: number };

export type Allowance = {
  /** Knock or buzz, and wait — spent whether or not anyone answers. */
  approachSec: number;
  /** Logging the outcome on the phone. Also spent regardless. */
  notesSec: number;
  /** The share of doors where somebody opens. */
  answerRate: number;
  /** The conversation, when there is one. */
  conversationSec: number;
  /** Buzzer, lobby, lift — paid once per multi-dwelling building, entered or not. */
  entrySec: number;
  /** The share of multi-dwelling buildings a canvasser cannot get into at all. */
  entryFailRate: number;
  /**
   * Footpath to front door and back, per building. Neither Mapbox nor a straight line
   * between buildings knows about the front path, the gate or the stairs — and in a
   * terrace street where doors are five metres apart, this is most of the walking.
   * Charged once per building, because the units in a block share the lobby walk.
   */
  doorApproachM: number;
  /** Walking pace, metres per second. Only used when Mapbox has not priced the legs. */
  walkSpeedMps: number;
};

/**
 * Literature priors, not measurements.
 *
 * Tuned so the model reproduces the bands canvassing manuals report — 15–27 doors/hour in
 * an urban street, 10–15 in a low-density regional one. The point of the tuning is to make
 * the model's *shape* checkable before any constant is trusted: it is the ranking and the
 * sensitivity that must be right, and `turf-estimate.model.spec.ts` pins both against the
 * distances actually measured on our turfs.
 *
 * Every value here is superseded the moment `canvass.DoorKnock` has rows.
 */
export const PRIOR_ALLOWANCE: Allowance = {
  approachSec: 45,
  notesSec: 15,
  answerRate: 0.3,
  conversationSec: 180,
  entrySec: 60,
  entryFailRate: 0.35,
  doorApproachM: 25,
  walkSpeedMps: 1.25,
};

/** Coordinate precision at which two addresses are the same building (~1.1 m). */
const BUILDING_PRECISION = 5;

/**
 * Collapse doors onto buildings.
 *
 * A block of flats shares one G-NAF coordinate across every unit, so grouping by rounded
 * latitude/longitude separates the walking (per building) from the knocking (per door)
 * without any dwelling-type data — which the address table does not carry. It is also the
 * apartment signal: 1.12 doors per building in a terrace street, 3.53 in a block of flats.
 */
export function groupBuildings(doors: Door[]): Building[] {
  const byKey = new Map<string, Building>();
  for (const d of doors) {
    if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) continue;
    const lat = Number(d.lat.toFixed(BUILDING_PRECISION));
    const lng = Number(d.lng.toFixed(BUILDING_PRECISION));
    const key = `${lat},${lng}`;
    const found = byKey.get(key);
    if (found) found.doors += 1;
    else byKey.set(key, { key, lat, lng, doors: 1 });
  }
  return [...byKey.values()];
}

/** Buildings in the order a canvasser would walk them. */
export function orderBuildings(buildings: Building[], start?: { lat: number; lng: number }): Building[] {
  const stops: Stop[] = buildings.map((b) => ({ id: b.key, lat: b.lat, lng: b.lng }));
  const ordered = optimiseRoute(stops, start);
  const byKey = new Map(buildings.map((b) => [b.key, b]));
  return ordered.map((s) => byKey.get(s.id)!);
}

/** Straight-line walking seconds along an ordered route. Always an under-estimate. */
export function crowFliesWalkSeconds(ordered: Building[], walkSpeedMps: number): number {
  const stops: Stop[] = ordered.map((b) => ({ id: b.key, lat: b.lat, lng: b.lng }));
  return routeLengthM(stops) / walkSpeedMps;
}

/**
 * Split an ordered route into Directions requests.
 *
 * Windows of 25 coordinates (the API's per-request limit) overlapping by one, so every
 * consecutive leg falls inside exactly one request and none is stitched together with a
 * straight line. A route of B buildings costs `ceil((B-1)/24)` requests.
 */
export function directionsWindows<T>(ordered: T[], size = 25): T[][] {
  if (ordered.length < 2) return [];
  const windows: T[][] = [];
  for (let i = 0; i < ordered.length - 1; i += size - 1) {
    windows.push(ordered.slice(i, i + size));
  }
  return windows;
}

export type TurfEstimate = {
  doors: number;
  buildings: number;
  doorsPerBuilding: number;
  /** Doors a canvasser can actually reach, after locked apartment lobbies. */
  reachableDoors: number;
  /** Between buildings — from Mapbox where a token exists, else straight lines. */
  walkSeconds: number;
  /** Up the front path and back, once per building. */
  approachWalkSeconds: number;
  entrySeconds: number;
  doorSeconds: number;
  totalSeconds: number;
  doorsPerHour: number;
  /** Doors in a four-hour shift, and how many shifts this turf is. */
  doorsPerShift: number;
  shifts: number;
};

const SHIFT_SECONDS = 4 * 3600;

/**
 * Assemble the estimate from the walk and the allowance.
 *
 * `walkSeconds` comes from Mapbox where a token exists (real footpaths, real crossings) and
 * from straight lines otherwise — the caller records which, because a straight-line figure
 * is always optimistic and must never be presented as a measurement.
 */
export function estimateTurf(buildings: Building[], walkSeconds: number, a: Allowance = PRIOR_ALLOWANCE): TurfEstimate {
  const doors = buildings.reduce((n, b) => n + b.doors, 0);
  if (doors === 0 || buildings.length === 0) {
    return {
      doors: 0,
      buildings: 0,
      doorsPerBuilding: 0,
      reachableDoors: 0,
      walkSeconds: 0,
      approachWalkSeconds: 0,
      entrySeconds: 0,
      doorSeconds: 0,
      totalSeconds: 0,
      doorsPerHour: 0,
      doorsPerShift: 0,
      shifts: 0,
    };
  }

  const multi = buildings.filter((b) => b.doors > 1);
  const doorsInMulti = multi.reduce((n, b) => n + b.doors, 0);
  const doorsInSingle = doors - doorsInMulti;

  // A locked lobby costs the walk and the buzz but yields no doors.
  const reachableDoors = doorsInSingle + doorsInMulti * (1 - a.entryFailRate);
  // The buzz is paid at every multi-dwelling building, whether or not it opens.
  const entrySeconds = multi.length * a.entrySec;
  const approachWalkSeconds = (buildings.length * a.doorApproachM) / a.walkSpeedMps;
  const doorSeconds = reachableDoors * (a.approachSec + a.notesSec + a.answerRate * a.conversationSec);

  const totalSeconds = walkSeconds + approachWalkSeconds + entrySeconds + doorSeconds;
  const doorsPerHour = totalSeconds > 0 ? (3600 * reachableDoors) / totalSeconds : 0;

  return {
    doors,
    buildings: buildings.length,
    doorsPerBuilding: doors / buildings.length,
    reachableDoors,
    walkSeconds,
    approachWalkSeconds,
    entrySeconds,
    doorSeconds,
    totalSeconds,
    doorsPerHour,
    doorsPerShift: Math.round((doorsPerHour * SHIFT_SECONDS) / 3600),
    shifts: totalSeconds / SHIFT_SECONDS,
  };
}

/** The whole pipeline, straight lines only — the fallback when no Mapbox token exists. */
export function estimateTurfCrowFlies(doors: Door[], a: Allowance = PRIOR_ALLOWANCE): TurfEstimate {
  const buildings = groupBuildings(doors);
  if (buildings.length === 0) return estimateTurf([], 0, a);
  const ordered = orderBuildings(buildings);
  return estimateTurf(ordered, crowFliesWalkSeconds(ordered, a.walkSpeedMps), a);
}

/** Metres between two consecutive buildings — exposed for the walk-distance diagnostics. */
export const buildingGapM = haversineM;
