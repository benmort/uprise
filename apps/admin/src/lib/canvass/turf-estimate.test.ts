import { describe, expect, it } from "vitest";
import type { TurfEstimate } from "@/lib/api";
import {
  MAX_SHIFTS_PER_TURF,
  describeBuildings,
  describeEstimate,
  isStraightLine,
  turfWarning,
} from "./turf-estimate";

const est = (over: Partial<TurfEstimate> = {}): TurfEstimate => ({
  doors: 120,
  buildings: 120,
  doorsPerBuilding: 1,
  doorsPerHour: 26.1,
  doorsPerShift: 105,
  shifts: 1.15,
  source: "directions",
  computedAt: "2026-07-11T00:00:00.000Z",
  ...over,
});

describe("describeEstimate", () => {
  it("rounds a normal rate to whole doors an hour", () => {
    expect(describeEstimate(est())).toBe("~26 doors/hr · 4 h ≈ 105 doors");
  });

  it("keeps a decimal on a very slow turf, where 1 door/hr matters", () => {
    expect(describeEstimate(est({ doorsPerHour: 4.3, doorsPerShift: 17 }))).toBe("~4.3 doors/hr · 4 h ≈ 17 doors");
  });

  it("groups thousands in the shift figure", () => {
    expect(describeEstimate(est({ doorsPerShift: 1234 }))).toContain("1,234 doors");
  });
});

describe("describeBuildings", () => {
  it("surfaces doors-per-building — the apartment signal", () => {
    // 3.53 was measured on a real block of flats; 1.12 on a Newtown terrace street.
    expect(describeBuildings(est({ buildings: 15, doorsPerBuilding: 3.53 }))).toBe("15 buildings · 3.53 doors each");
    expect(describeBuildings(est({ buildings: 107, doorsPerBuilding: 1.12 }))).toBe("107 buildings · 1.12 doors each");
  });

  it("does not say '1 buildings'", () => {
    expect(describeBuildings(est({ buildings: 1, doorsPerBuilding: 120 }))).toContain("1 building ·");
  });
});

describe("isStraightLine", () => {
  it("is true for anything that did not walk a real footpath", () => {
    expect(isStraightLine(est({ source: "crowflies" }))).toBe(true);
    expect(isStraightLine(est({ source: "directions" }))).toBe(false);
    // An unknown source is treated as unmeasured, not as measured.
    expect(isStraightLine(est({ source: "something-new" }))).toBe(true);
  });
});

describe("turfWarning", () => {
  it("says nothing about a turf that fits a shift", () => {
    expect(turfWarning(est({ shifts: 1.2 }))).toBeNull();
  });

  it("has nothing to say about an unpriced turf", () => {
    expect(turfWarning(null)).toBeNull();
  });

  it("distinguishes an empty turf from an unpriced one", () => {
    expect(turfWarning(est({ doors: 0, shifts: 0 }))).toEqual({ level: "info", text: "No doors in this turf" });
  });

  it("tells the organiser to split a turf that is too much work", () => {
    const w = turfWarning(est({ shifts: 3.4 }));
    expect(w).toEqual({ level: "warn", text: "3.4 shifts of work — split this turf" });
  });

  it("rounds the shift count on a Kew-sized turf, which should never have been one turf", () => {
    // 39,914 doors at ~24 doors/hr is about 27 shifts.
    expect(turfWarning(est({ doors: 39_914, shifts: 27.2 }))!.text).toBe("27 shifts of work — split this turf");
  });

  it("puts the boundary exactly at the cap", () => {
    expect(turfWarning(est({ shifts: MAX_SHIFTS_PER_TURF }))).toBeNull();
    expect(turfWarning(est({ shifts: MAX_SHIFTS_PER_TURF + 0.01 }))!.level).toBe("warn");
  });
});
