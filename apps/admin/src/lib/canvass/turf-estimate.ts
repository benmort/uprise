import type { TurfEstimate } from "@/lib/api";

/**
 * Reading a turf's doors-per-hour estimate.
 *
 * Two honesty rules live here rather than in the component, so they are tested:
 *
 *  - A `crowflies` estimate priced the walk with straight lines. A real footpath is never
 *    shorter, so the figure is an upper bound on speed. It must be labelled, never rounded
 *    into looking measured.
 *  - A turf worth more than about one and a half shifts is not a turf. Kew is 39,914 doors,
 *    twenty-seven shifts; saying so is most of what this feature is for.
 */

/** Above this, the turf should be split before anyone is assigned to it. */
export const MAX_SHIFTS_PER_TURF = 1.5;

/** "26 doors/hr · 4 h ≈ 105 doors" */
export function describeEstimate(e: TurfEstimate): string {
  const rate = e.doorsPerHour >= 10 ? Math.round(e.doorsPerHour) : e.doorsPerHour.toFixed(1);
  return `~${rate} doors/hr · 4 h ≈ ${e.doorsPerShift.toLocaleString()} doors`;
}

/** "886 buildings · 1.40 doors each" — the apartment signal, in words. */
export function describeBuildings(e: TurfEstimate): string {
  return `${e.buildings.toLocaleString()} building${e.buildings === 1 ? "" : "s"} · ${e.doorsPerBuilding.toFixed(2)} doors each`;
}

/** True when the estimate's walk was never measured against a real footpath. */
export function isStraightLine(e: TurfEstimate): boolean {
  return e.source !== "directions";
}

export type TurfWarning = { level: "warn" | "info"; text: string };

/**
 * What to tell the organiser about this turf, if anything.
 *
 * `shifts` is total work, not calendar time: a 27-shift turf is not "a long day", it is a
 * turf that should have been twenty-seven turfs.
 */
export function turfWarning(e: TurfEstimate | null): TurfWarning | null {
  if (!e) return null;
  if (e.doors === 0) return { level: "info", text: "No doors in this turf" };
  if (e.shifts > MAX_SHIFTS_PER_TURF) {
    const shifts = e.shifts >= 10 ? Math.round(e.shifts) : e.shifts.toFixed(1);
    return { level: "warn", text: `${shifts} shifts of work — split this turf` };
  }
  return null;
}
