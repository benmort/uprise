/**
 * Client-side turf-time planning maths — a faithful port of the authoritative model in
 * `apps/api/src/canvassing/turf-estimate.model.ts` (`estimateTurf` + `PRIOR_ALLOWANCE`).
 *
 * The backend model prices a *real* turf from its geocoded addresses (and Mapbox-routed
 * walks); this port prices a *hypothetical* turf from a density preset, so the planner page
 * can answer "how big should this turf be?" before any addresses exist. Every constant is a
 * literature prior, and every number here is a forecast until `canvass.DoorKnock` has real
 * timings — keep the two in sync if the priors change.
 */

export const PRIOR_ALLOWANCE = {
  /** Knock or buzz, and wait — spent whether or not anyone answers. */
  approachSec: 45,
  /** Logging the outcome on the phone. */
  notesSec: 15,
  /** The share of doors where somebody opens. */
  answerRate: 0.3,
  /** The conversation, when there is one. */
  conversationSec: 180,
  /** Buzzer / lobby / lift — paid once per multi-dwelling building. */
  entrySec: 60,
  /** The share of multi-dwelling buildings a canvasser cannot get into at all. */
  entryFailRate: 0.35,
  /** Footpath to the front door and back, per building. */
  doorApproachM: 25,
  /** Walking pace between buildings, metres per second. */
  walkSpeedMps: 1.25,
} as const;

const A = PRIOR_ALLOWANCE;

/** One street address group — units in a block share a coordinate, so they share a building. */
export type Building = { doors: number };

export type TurfEstimate = {
  doors: number;
  buildings: number;
  /** Doors a canvasser can actually reach, after locked apartment lobbies. */
  reachableDoors: number;
  walkSeconds: number;
  approachWalkSeconds: number;
  entrySeconds: number;
  doorSeconds: number;
  totalSeconds: number;
  doorsPerHour: number;
};

/** Assemble the estimate from the buildings + the between-building walk (verbatim from the model). */
export function estimateTurf(buildings: Building[], walkSeconds: number): TurfEstimate {
  const doors = buildings.reduce((n, b) => n + b.doors, 0);
  if (doors === 0 || buildings.length === 0) {
    return {
      doors: 0,
      buildings: 0,
      reachableDoors: 0,
      walkSeconds: 0,
      approachWalkSeconds: 0,
      entrySeconds: 0,
      doorSeconds: 0,
      totalSeconds: 0,
      doorsPerHour: 0,
    };
  }
  const multi = buildings.filter((b) => b.doors > 1);
  const doorsInMulti = multi.reduce((n, b) => n + b.doors, 0);
  const doorsInSingle = doors - doorsInMulti;
  // A locked lobby costs the walk and the buzz but yields no doors.
  const reachableDoors = doorsInSingle + doorsInMulti * (1 - A.entryFailRate);
  const entrySeconds = multi.length * A.entrySec;
  const approachWalkSeconds = (buildings.length * A.doorApproachM) / A.walkSpeedMps;
  const doorSeconds = reachableDoors * (A.approachSec + A.notesSec + A.answerRate * A.conversationSec);
  const totalSeconds = walkSeconds + approachWalkSeconds + entrySeconds + doorSeconds;
  const doorsPerHour = totalSeconds > 0 ? (3600 * reachableDoors) / totalSeconds : 0;
  return {
    doors,
    buildings: buildings.length,
    reachableDoors,
    walkSeconds,
    approachWalkSeconds,
    entrySeconds,
    doorSeconds,
    totalSeconds,
    doorsPerHour,
  };
}

/**
 * A representative turf of `addresses` doors at `doorsPerBuilding` each, `gapMetres` apart.
 * Distributes doors so the split of single vs multi-dwelling buildings — which drives the
 * locked-lobby penalty and the shared approach walk — matches the density.
 */
export function buildTurf(
  addresses: number,
  doorsPerBuilding: number,
  gapMetres: number,
): { buildings: Building[]; walkSeconds: number; addresses: number } {
  const count = Math.max(1, Math.round(addresses));
  // Never more buildings than addresses (so every building keeps ≥ 1 door).
  const n = Math.min(count, Math.max(1, Math.round(count / doorsPerBuilding)));
  // Spread the doors as evenly as possible: the remainder buildings get one extra, which
  // reproduces the single-vs-multi split the density implies (e.g. 21 of 179 terrace
  // buildings become 2-door), and lands exactly on the address count.
  const base = Math.floor(count / n);
  const remainder = count - base * n;
  const buildings: Building[] = Array.from({ length: n }, (_unused, j) => ({
    doors: base + (j < remainder ? 1 : 0),
  }));
  const walkSeconds = (gapMetres * (n - 1)) / A.walkSpeedMps;
  return { buildings, walkSeconds, addresses: count };
}

export type DensityPreset = {
  id: string;
  label: string;
  doorsPerBuilding: number;
  gapMetres: number;
  /** The reference place the prior is tuned against. */
  hint: string;
};

/** Representative densities, tuned to the distances the model header cites. */
export const DENSITY_PRESETS: DensityPreset[] = [
  { id: "terrace", label: "Inner-city terrace", doorsPerBuilding: 1.12, gapMetres: 4.7, hint: "Newtown" },
  { id: "suburban", label: "Detached suburban", doorsPerBuilding: 1.0, gapMetres: 15.9, hint: "Kew" },
  { id: "flats", label: "Walk-up flats", doorsPerBuilding: 3.53, gapMetres: 10, hint: "shared lobby" },
  { id: "tower", label: "Apartment tower", doorsPerBuilding: 40, gapMetres: 30, hint: "locked lobbies" },
  { id: "township", label: "Regional township", doorsPerBuilding: 1.0, gapMetres: 47, hint: "spread out" },
  { id: "rural", label: "Rural spread", doorsPerBuilding: 1.0, gapMetres: 120, hint: "West Wimmera" },
];

export type Pace = "fast" | "steady" | "slow";

/** Band a productive door rate for the pace chip. */
export function paceOf(doorsPerHour: number): Pace {
  if (doorsPerHour >= 23) return "fast";
  if (doorsPerHour >= 18) return "steady";
  return "slow";
}

/** "2 h 45 m" / "45 m". */
export function formatHours(hoursFloat: number): string {
  const totalMin = Math.round(hoursFloat * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin - h * 60;
  if (h <= 0) return `${m} m`;
  return m ? `${h} h ${m} m` : `${h} h`;
}
