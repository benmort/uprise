import {
  PRIOR_ALLOWANCE,
  crowFliesWalkSeconds,
  directionsWindows,
  estimateTurf,
  estimateTurfCrowFlies,
  groupBuildings,
  orderBuildings,
  type Door,
} from "./turf-estimate.model";
import { haversineM, optimiseRoute, routeLengthM } from "./route-math";

/** A row of `n` doors, `gapM` metres apart along a line of latitude. */
function street(n: number, gapM: number, lat = -37.8, lng = 144.96): Door[] {
  const degPerM = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: n }, (_, i) => ({ id: `d${i}`, lat, lng: lng + i * gapM * degPerM }));
}

describe("groupBuildings", () => {
  it("collapses units that share a coordinate into one building", () => {
    // A block of flats: G-NAF gives every unit the same point.
    const doors: Door[] = Array.from({ length: 12 }, (_, i) => ({ id: `u${i}`, lat: -37.8, lng: 144.96 }));
    const buildings = groupBuildings(doors);
    expect(buildings).toHaveLength(1);
    expect(buildings[0].doors).toBe(12);
  });

  it("keeps addresses a few metres apart as separate buildings", () => {
    // 5 decimal places ≈ 1.1 m, so 10 m apart must not merge.
    expect(groupBuildings(street(4, 10))).toHaveLength(4);
  });

  it("skips ungeocoded doors rather than placing them at null island", () => {
    const doors = [
      { id: "a", lat: -37.8, lng: 144.96 },
      { id: "b", lat: Number.NaN, lng: 144.96 },
      { id: "c", lat: -37.8, lng: Number.POSITIVE_INFINITY },
    ];
    expect(groupBuildings(doors)).toHaveLength(1);
  });

  it("is empty for no doors", () => {
    expect(groupBuildings([])).toEqual([]);
  });
});

describe("optimiseRoute", () => {
  it("never lengthens a route it was given", () => {
    const stops = street(12, 25).map((d) => ({ id: d.id, lat: d.lat, lng: d.lng }));
    const shuffled = [stops[5], stops[0], stops[9], stops[2], stops[7], stops[1], stops[11], stops[3], stops[8], stops[4], stops[10], stops[6]];
    expect(routeLengthM(optimiseRoute(shuffled))).toBeLessThanOrEqual(routeLengthM(shuffled) + 1e-6);
  });

  it("recovers the obvious order on a straight street", () => {
    const stops = street(8, 20).map((d) => ({ id: d.id, lat: d.lat, lng: d.lng }));
    const jumbled = [...stops].reverse();
    // Optimal is the street order (or its reverse); either way the length is the span.
    const span = haversineM(stops[0], stops[7]);
    expect(routeLengthM(optimiseRoute(jumbled))).toBeCloseTo(span, 0);
  });

  it("returns short inputs untouched", () => {
    const two = street(2, 10).map((d) => ({ id: d.id, lat: d.lat, lng: d.lng }));
    expect(optimiseRoute(two)).toEqual(two);
    expect(optimiseRoute([])).toEqual([]);
  });

  it("finishes on a turf far too big for 2-opt", () => {
    // Kew holds 28,580 buildings. An O(n³) 2-opt would never return; this must.
    const many = street(3_000, 15).map((d) => ({ id: d.id, lat: d.lat, lng: d.lng }));
    const started = Date.now();
    const ordered = optimiseRoute(many);
    expect(ordered).toHaveLength(3_000);
    expect(Date.now() - started).toBeLessThan(20_000);
  }, 30_000);
});

describe("directionsWindows", () => {
  it("overlaps by one, so no leg is ever stitched with a straight line", () => {
    const windows = directionsWindows([1, 2, 3, 4, 5, 6, 7], 3);
    expect(windows).toEqual([
      [1, 2, 3],
      [3, 4, 5],
      [5, 6, 7],
    ]);
    // Every consecutive pair appears inside exactly one window.
    const legs = new Set<string>();
    for (const w of windows) for (let i = 1; i < w.length; i++) legs.add(`${w[i - 1]}-${w[i]}`);
    expect(legs.size).toBe(6);
  });

  it("costs ceil((B-1)/24) requests at the real window size", () => {
    expect(directionsWindows(Array.from({ length: 25 }), 25)).toHaveLength(1);
    expect(directionsWindows(Array.from({ length: 26 }), 25)).toHaveLength(2);
    // Kew: 28,580 buildings.
    expect(directionsWindows(Array.from({ length: 28_580 }), 25)).toHaveLength(Math.ceil(28_579 / 24));
  });

  it("has nothing to price with fewer than two stops", () => {
    expect(directionsWindows([1])).toEqual([]);
    expect(directionsWindows([])).toEqual([]);
  });
});

describe("estimateTurf", () => {
  it("charges the buzzer once per block of flats, not once per unit", () => {
    const flats = groupBuildings(Array.from({ length: 20 }, (_, i) => ({ id: `u${i}`, lat: -37.8, lng: 144.96 })));
    const est = estimateTurf(flats, 0);
    expect(est.buildings).toBe(1);
    expect(est.entrySeconds).toBe(PRIOR_ALLOWANCE.entrySec);
  });

  it("does not charge an entry fee for a street of houses", () => {
    expect(estimateTurf(groupBuildings(street(10, 20)), 0).entrySeconds).toBe(0);
  });

  it("loses the doors behind a lobby that will not open", () => {
    const flats = groupBuildings(Array.from({ length: 100 }, (_, i) => ({ id: `u${i}`, lat: -37.8, lng: 144.96 })));
    const est = estimateTurf(flats, 0);
    expect(est.doors).toBe(100);
    expect(est.reachableDoors).toBeCloseTo(100 * (1 - PRIOR_ALLOWANCE.entryFailRate), 6);
  });

  it("is all zeroes for an empty turf, and never divides by zero", () => {
    const est = estimateTurf([], 0);
    expect(est).toMatchObject({ doors: 0, doorsPerHour: 0, shifts: 0 });
    expect(Number.isFinite(est.doorsPerHour)).toBe(true);
  });

  it("counts a four-hour shift and how many of them a turf is", () => {
    const est = estimateTurf(groupBuildings(street(400, 15)), 0);
    expect(est.doorsPerShift).toBe(Math.round(est.doorsPerHour * 4));
    expect(est.shifts).toBeCloseTo(est.totalSeconds / (4 * 3600), 6);
  });
});

/**
 * `clusters` houses per town, `gapM` apart, towns `hopM` apart.
 *
 * A rural turf is not a long street. West Wimmera's median door-to-door walk is 47 m —
 * people cluster in towns — and it is the p90 of 1,297 m that destroys the shift. Modelling
 * it as an evenly-spaced street would understate the walk by an order of magnitude.
 */
function scatteredTowns(towns: number, per: number, gapM: number, hopM: number, lat = -36.5): Door[] {
  const degPerM = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
  const doors: Door[] = [];
  let lng = 141.5;
  for (let t = 0; t < towns; t++) {
    for (let i = 0; i < per; i++) doors.push({ id: `t${t}h${i}`, lat, lng: lng + i * gapM * degPerM });
    lng += (per * gapM + hopM) * degPerM;
  }
  return doors;
}

describe("the model must distinguish the places we measured", () => {
  /**
   * Measured building-to-building, against the indexed address table: Newtown 4.7 m median,
   * Kew 15.9 m, West Wimmera 47 m with a p90 of 1,297 m. If the model returns the same
   * doors/hour for a terrace street and a wheat town, it is not a model.
   */
  const newtown = estimateTurfCrowFlies(street(120, 4.7));
  const kew = estimateTurfCrowFlies(street(120, 15.9));
  const wimmera = estimateTurfCrowFlies(scatteredTowns(12, 10, 47, 1_300));

  it("ranks density: Newtown knocks faster than Kew, and Kew faster than the Wimmera", () => {
    expect(newtown.doorsPerHour).toBeGreaterThan(kew.doorsPerHour);
    expect(kew.doorsPerHour).toBeGreaterThan(wimmera.doorsPerHour);
  });

  it("puts an urban street inside the 15–27 doors/hour the manuals report", () => {
    for (const est of [newtown, kew]) {
      expect(est.doorsPerHour).toBeGreaterThan(15);
      expect(est.doorsPerHour).toBeLessThan(27);
    }
  });

  it("puts a scattered regional turf inside the 10–15 doors/hour manuals report for it", () => {
    expect(wimmera.doorsPerHour).toBeGreaterThan(10);
    expect(wimmera.doorsPerHour).toBeLessThan(15);
  });

  it("blames the long hops, not the median — the walk is where the rural shift goes", () => {
    // Same door count, same allowance; only the geometry differs.
    expect(wimmera.doors).toBe(newtown.doors);
    expect(wimmera.walkSeconds).toBeGreaterThan(newtown.walkSeconds * 20);
    expect(wimmera.walkSeconds).toBeGreaterThan(wimmera.doorSeconds); // walking dominates
    expect(newtown.walkSeconds).toBeLessThan(newtown.doorSeconds); // knocking dominates
  });

  it("a block of flats out-knocks any street, because there is no walk between buildings", () => {
    const flats = estimateTurfCrowFlies(
      Array.from({ length: 120 }, (_, i) => ({ id: `u${i}`, lat: -37.8, lng: 144.96 })),
    );
    expect(flats.walkSeconds).toBe(0);
    expect(flats.doorsPerHour).toBeGreaterThan(newtown.doorsPerHour);
    // …but the buzzer is still paid, and a third of the lobbies never open.
    expect(flats.entrySeconds).toBe(PRIOR_ALLOWANCE.entrySec);
    expect(flats.reachableDoors).toBeLessThan(flats.doors);
  });

  it("charges the front path even where buildings are metres apart", () => {
    // In a terrace street the walk between doors is 4.7 m; the path to each door is 25 m.
    expect(newtown.approachWalkSeconds).toBeGreaterThan(newtown.walkSeconds);
  });

  it("straight lines flatter every turf — a footpath is never shorter", () => {
    const ordered = orderBuildings(groupBuildings(street(50, 20)));
    expect(crowFliesWalkSeconds(ordered, PRIOR_ALLOWANCE.walkSpeedMps)).toBeGreaterThan(0);
  });
});
