import { describe, expect, it } from "vitest";
import {
  buildTurf,
  DENSITY_PRESETS,
  estimateTurf,
  formatHours,
  paceOf,
  PRIOR_ALLOWANCE,
} from "./turf-planner";

describe("estimateTurf", () => {
  it("returns all-zero for an empty turf", () => {
    const e = estimateTurf([], 0);
    expect(e).toMatchObject({ doors: 0, buildings: 0, reachableDoors: 0, doorsPerHour: 0, totalSeconds: 0 });
  });

  it("prices a detached suburban block at the model's ~24.6 doors/hr", () => {
    // 60 single-door buildings, 15.9 m apart → matches the backend model output.
    const t = buildTurf(60, 1.0, 15.9);
    const e = estimateTurf(t.buildings, t.walkSeconds);
    expect(e.reachableDoors).toBe(60); // no multi-dwelling ⇒ nothing lost to lobbies
    expect(e.entrySeconds).toBe(0);
    expect(e.doorsPerHour).toBeCloseTo(24.57, 1);
  });

  it("docks apartment towers 35% of doors to locked lobbies but knocks fastest", () => {
    const t = buildTurf(200, 40, 30); // 5 towers × 40 doors
    const e = estimateTurf(t.buildings, t.walkSeconds);
    expect(e.reachableDoors).toBeCloseTo(200 * (1 - PRIOR_ALLOWANCE.entryFailRate), 5); // 130
    expect(e.entrySeconds).toBe(5 * PRIOR_ALLOWANCE.entrySec);
    expect(e.doorsPerHour).toBeCloseTo(30.56, 1);
  });

  it("the door-service time dominates the walk in ordinary streets", () => {
    const t = buildTurf(60, 1.0, 15.9);
    const e = estimateTurf(t.buildings, t.walkSeconds);
    expect(e.doorSeconds).toBeGreaterThan(e.walkSeconds + e.approachWalkSeconds);
  });
});

describe("buildTurf", () => {
  it("tops up doors to hit the address count and marks multi-dwelling buildings", () => {
    const t = buildTurf(10, 3, 10); // 3 buildings, doors 4/3/3
    expect(t.addresses).toBe(10);
    expect(t.buildings.reduce((n, b) => n + b.doors, 0)).toBe(10);
    expect(t.buildings.every((b) => b.doors > 1)).toBe(true);
  });

  it("trims when a high doors/building floor overshoots a small turf", () => {
    const t = buildTurf(5, 40, 30); // round(5/40)=1 building, base 40 → trim back to 5
    expect(t.buildings).toHaveLength(1);
    expect(t.addresses).toBe(5);
    expect(t.buildings[0]!.doors).toBe(5);
  });

  it("never returns zero buildings and derives the between-building walk from the gap", () => {
    const t = buildTurf(4, 1, 12.5);
    expect(t.buildings).toHaveLength(4);
    // 3 legs × 12.5 m ÷ 1.25 m/s
    expect(t.walkSeconds).toBeCloseTo((12.5 * 3) / 1.25, 5);
  });
});

describe("paceOf", () => {
  it("bands the rate into fast / steady / slow", () => {
    expect(paceOf(30)).toBe("fast");
    expect(paceOf(23)).toBe("fast");
    expect(paceOf(20)).toBe("steady");
    expect(paceOf(18)).toBe("steady");
    expect(paceOf(15.8)).toBe("slow");
  });
});

describe("formatHours", () => {
  it("formats hours and minutes, dropping empty parts", () => {
    expect(formatHours(2.75)).toBe("2 h 45 m");
    expect(formatHours(4)).toBe("4 h");
    expect(formatHours(0.75)).toBe("45 m");
    expect(formatHours(0)).toBe("0 m");
  });
});

describe("DENSITY_PRESETS", () => {
  it("spans terrace through rural with distinct paces once run through the model", () => {
    const rates = DENSITY_PRESETS.map((d) => {
      const t = buildTurf(200, d.doorsPerBuilding, d.gapMetres);
      return estimateTurf(t.buildings, t.walkSeconds).doorsPerHour;
    });
    // fastest is the tower, slowest is the rural spread.
    expect(Math.max(...rates)).toBeCloseTo(30.56, 0);
    expect(Math.min(...rates)).toBeLessThan(17);
  });
});
